import { MDocument } from "@mastra/rag";
import { embedMany, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { ResultAsync } from "neverthrow";
import { mastra } from "./mastra/index";
import { ensureBucket, uploadToS3 } from "./s3";
import { insertFile } from "./file-store";
import { cleanseWithGemini } from "./cleansing";
import { withRetry } from "./retry";
import { JobStore } from "./job-store";
import pdfParse from "pdf-parse";
import { toError } from "./errors";
import { IMAGE_DESCRIPTION_PROMPT } from "./prompts/prompts";
import { recordUsage } from "./usage-store";

// PDFのテキスト抽出
function parsePdf(buf: Buffer): ResultAsync<{ text: string }, Error> {
  return ResultAsync.fromPromise(
    (async () => {
      const origWarn = console.warn;
      const origLog = console.log;
      const filter = (...args: unknown[]) =>
        typeof args[0] === "string" && args[0].includes("private use area");
      console.warn = (...a: unknown[]) => { if (!filter(...a)) origWarn.apply(console, a); };
      console.log = (...a: unknown[]) => { if (!filter(...a)) origLog.apply(console, a); };
      try {
        return await pdfParse(buf);
      } finally {
        console.warn = origWarn;
        console.log = origLog;
      }
    })(),
    toError
  );
}

// ドキュメントのチャンク分割
export function chunkDocument(
  text: string,
  metadata: Record<string, unknown>
): ResultAsync<Array<{ text: string; metadata?: Record<string, unknown> }>, Error> {
  const doc = MDocument.fromText(text, { metadata });
  return ResultAsync.fromPromise(
    doc.chunk({ strategy: "recursive", maxSize: 512, overlap: 50 }),
    toError
  );
}

// チャンクのベクトル化
export function embedChunks(
  texts: string[]
): ResultAsync<number[][], Error> {
  const start = performance.now();
  return withRetry(() =>
    embedMany({
      values: texts,
      model: google.embeddingModel("gemini-embedding-001"),
      providerOptions: { google: { outputDimensionality: 1536 } },
    })
  ).map((r) => {
    recordUsage({
      step: "embed_chunks",
      model: "gemini-embedding-001",
      promptTokens: r.usage.tokens,
      completionTokens: 0,
      totalTokens: r.usage.tokens,
      latencyMs: Math.round(performance.now() - start),
    });
    return r.embeddings;
  });
}

// ベクトルのアップサート
export function upsertVectors(
  chunks: Array<{ text: string; metadata?: Record<string, unknown> }>,
  embeddings: number[][],
  fileId: string
): ResultAsync<void, Error> {
  const vectorStore = mastra.getVector("pgVector");
  return ResultAsync.fromPromise(
    vectorStore.upsert({
      indexName: "rag_chunks",
      vectors: embeddings,
      metadata: chunks.map((chunk, index) => ({
        text: chunk.text,
        fileId,
        chunkIndex: index,
      })),
    }).then(() => undefined),
    toError
  );
}

// PDFのインデクシング
export async function indexPdf({
  jobId,
  fileId,
  fileName,
  pdfBuffer,
}: {
  jobId: string;
  fileId: string;
  fileName: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const s3Key = `docs/${fileId}.pdf`;

  const result = await insertFile({
    fileId,
    fileName,
    fileType: "pdf",
    s3Key,
    uploadType: 0,
  })
    .andThen(() => ensureBucket())
    .andThen(() => uploadToS3(s3Key, pdfBuffer, "application/pdf"))
    .map(() => { JobStore.markUploaded(jobId, fileId); })
    .andThen(() => parsePdf(pdfBuffer))
    .andThen(({ text }) => cleanseWithGemini(text))
    .andThen((cleansedText) =>
      chunkDocument(cleansedText, { fileId })
    )
    .andThen((chunks) =>
      embedChunks(chunks.map((c) => c.text)).map((embeddings) => ({ chunks, embeddings }))
    )
    .andThen(({ chunks, embeddings }) =>
      upsertVectors(chunks, embeddings, fileId).map(
        () => chunks.length
      )
    );

  result.match(
    (chunkCount) => JobStore.markDone(jobId, fileId, chunkCount),
    (err) => JobStore.markFailed(jobId, err.message)
  );
}

// 画像のインデクシング
export async function indexImage({
  jobId,
  fileId,
  fileName,
  imageBuffer,
  contentType,
}: {
  jobId: string;
  fileId: string;
  fileName: string;
  imageBuffer: Buffer;
  contentType: string;
}): Promise<void> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const s3Key = `images/${fileId}.${ext}`;
  const base64 = imageBuffer.toString("base64");

  const describeStart = performance.now();
  const describeImage = withRetry(() =>
    generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: IMAGE_DESCRIPTION_PROMPT,
            },
            { type: "image", image: `data:${contentType};base64,${base64}` },
          ],
        },
      ],
    })
  ).map((r) => {
    recordUsage({
      step: "describe_image",
      model: "gemini-2.5-flash",
      promptTokens: r.usage.inputTokens ?? 0,
      completionTokens: r.usage.outputTokens ?? 0,
      totalTokens: r.usage.totalTokens ?? 0,
      latencyMs: Math.round(performance.now() - describeStart),
    });
    return r.text;
  });

  const result = await insertFile({
    fileId,
    fileName,
    fileType: "image",
    s3Key,
    uploadType: 0,
  })
    .andThen(() => ensureBucket())
    .andThen(() => uploadToS3(s3Key, imageBuffer, contentType))
    .map(() => { JobStore.markUploaded(jobId, fileId); })
    .andThen(() => describeImage)
    .andThen((description) =>
      chunkDocument(description, { fileId })
    )
    .andThen((chunks) =>
      embedChunks(chunks.map((c) => c.text)).map((embeddings) => ({ chunks, embeddings }))
    )
    .andThen(({ chunks, embeddings }) =>
      upsertVectors(chunks, embeddings, fileId).map(
        () => chunks.length
      )
    );

  result.match(
    (chunkCount) => JobStore.markDone(jobId, fileId, chunkCount),
    (err) => JobStore.markFailed(jobId, err.message)
  );
}
