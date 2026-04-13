import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { ResultAsync } from "neverthrow";
import { getFileAsBase64 } from "../../../../lib/s3";
import { findFileById } from "../../../../lib/file-store";
import { uiChatRequestSchema } from "../../../../packages/shared/src/schemas";
import { toError } from "../../../../lib/errors";
import {
  KNOWLEDGE_SYSTEM_PROMPT,
  NO_CONTEXT_SYSTEM_PROMPT,
  CASUAL_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT,
} from "../../../../lib/prompts/prompts";
import { recordUsage } from "../../../../lib/usage-store";
import { classifyQuery } from "../../../../lib/query-classifier";
import { runKeywordSearch } from "../../../../lib/mastra/tools/keyword-search";
import { runSemanticSearch } from "../../../../lib/mastra/tools/semantic-search";
import { agentTools, AGENT_MAX_STEPS } from "../../../../lib/mastra/agent";

const chatRoute = new Hono();

chatRoute.post("/", zValidator("json", uiChatRequestSchema), async (c) => {
  const validated = c.req.valid("json");
  const messages = validated.messages as UIMessage[];

  const latestUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const latestUserMessage =
    latestUserMsg?.parts
      ?.filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";

  // Step 1: クエリ複雑度を分類（simple / moderate / complex）
  const classifyStart = performance.now();
  const classifyResult = await classifyQuery(latestUserMessage);

  if (classifyResult.isErr()) {
    console.error("[chat] Query classification failed:", classifyResult.error.message);
    return c.json({ error: "メッセージの分類に失敗しました" }, 500);
  }

  const { complexity } = classifyResult.value;
  console.log(`[chat] Query classified as: ${complexity} — "${latestUserMessage.slice(0, 60)}"`);
  recordUsage({
    step: "classify_query",
    model: "gemini-2.5-flash",
    promptTokens: classifyResult.value.usage.inputTokens,
    completionTokens: classifyResult.value.usage.outputTokens,
    totalTokens: classifyResult.value.usage.totalTokens,
    latencyMs: Math.round(performance.now() - classifyStart),
  });

  const modelMessages = await convertToModelMessages(messages.slice(0, -1));

  // --- Route: simple（検索なし・LLM 直答）---
  if (complexity === "simple") {
    const start = performance.now();
    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: CASUAL_SYSTEM_PROMPT,
      messages: [...modelMessages, { role: "user" as const, content: latestUserMessage }],
      onFinish({ usage }) {
        recordUsage({
          step: "stream_simple",
          model: "gemini-2.5-flash",
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          latencyMs: Math.round(performance.now() - start),
        });
      },
    });
    return result.toUIMessageStreamResponse({ originalMessages: messages });
  }

  // --- Route: complex（Agentic RAG — エージェントが自律的に検索）---
  if (complexity === "complex") {
    const start = performance.now();
    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: AGENT_SYSTEM_PROMPT,
      messages: [...modelMessages, { role: "user" as const, content: latestUserMessage }],
      tools: agentTools,
      stopWhen: stepCountIs(AGENT_MAX_STEPS),
      onFinish({ usage }) {
        recordUsage({
          step: "stream_complex",
          model: "gemini-2.5-flash",
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          latencyMs: Math.round(performance.now() - start),
        });
      },
    });
    return result.toUIMessageStreamResponse({ originalMessages: messages });
  }

  // --- Route: moderate（ハイブリッド検索 1 回 → LLM）---
  const searchResult = await ResultAsync.fromPromise(
    Promise.all([runKeywordSearch(latestUserMessage), runSemanticSearch(latestUserMessage)]),
    toError,
  );

  if (searchResult.isErr()) {
    console.error("[chat] Hybrid search failed:", searchResult.error.message);
    return c.json({ error: "ドキュメント検索に失敗しました" }, 500);
  }

  const [keywordResults, semanticResults] = searchResult.value;

  // マージ: semantic を優先し、keyword で補完（ID で重複排除）
  const seen = new Set<string>();
  const mergedResults: Array<{ id: string; text: string; fileId: string; score: number }> = [];
  for (const r of [...semanticResults, ...keywordResults]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      mergedResults.push(r);
    }
  }
  const topResults = mergedResults.slice(0, 7);

  // ファイル情報を取得
  const chunkFileIds = new Set(topResults.map((r) => r.fileId));
  const fileInfoMap = new Map<
    string,
    { fileName: string; fileType: string; s3Key: string | null }
  >();
  await Promise.all(
    [...chunkFileIds].map(async (fid) => {
      const fileResult = await findFileById(fid);
      if (fileResult.isOk() && fileResult.value) {
        fileInfoMap.set(fid, {
          fileName: fileResult.value.fileName,
          fileType: fileResult.value.fileType,
          s3Key: fileResult.value.s3Key,
        });
      }
    }),
  );

  const textChunks: Array<{ text: string; fileName: string }> = [];
  const imageChunks: Array<{ s3Key: string; fileName: string }> = [];

  for (const r of topResults) {
    const fileInfo = fileInfoMap.get(r.fileId);
    if (!fileInfo) continue;
    if (fileInfo.fileType === "image" && fileInfo.s3Key) {
      imageChunks.push({ s3Key: fileInfo.s3Key, fileName: fileInfo.fileName });
    } else if (r.text) {
      textChunks.push({ text: r.text, fileName: fileInfo.fileName });
    }
  }

  const hasContext = textChunks.length > 0 || imageChunks.length > 0;

  const imageContents = (
    await Promise.all(
      imageChunks.map(({ s3Key }) =>
        getFileAsBase64(s3Key).match(
          ({ base64, contentType }) => ({
            type: "image" as const,
            image: `data:${contentType};base64,${base64}`,
          }),
          (err) => {
            console.error("[chat] 画像取得失敗:", err.message);
            return null;
          },
        ),
      ),
    )
  ).filter((v): v is { type: "image"; image: string } => v !== null);

  const sourceFileNames = [
    ...new Set([
      ...textChunks.map((ch) => ch.fileName),
      ...imageChunks.map((ch) => ch.fileName),
    ]),
  ];

  const contextBlock = textChunks
    .map((chunk) => `【${chunk.fileName}】\n${chunk.text}`)
    .join("\n\n---\n\n");

  const systemPrompt = hasContext
    ? `${KNOWLEDGE_SYSTEM_PROMPT}\n\n参照ファイル候補: ${sourceFileNames.join(", ")}`
    : NO_CONTEXT_SYSTEM_PROMPT;

  const userContent = hasContext
    ? [
        {
          type: "text" as const,
          text: `コンテキスト:\n${contextBlock}\n\n質問: ${latestUserMessage}`,
        },
        ...imageContents,
      ]
    : [{ type: "text" as const, text: latestUserMessage }];

  const start = performance.now();
  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    messages: [...modelMessages, { role: "user" as const, content: userContent }],
    onFinish({ usage }) {
      recordUsage({
        step: "stream_moderate",
        model: "gemini-2.5-flash",
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        latencyMs: Math.round(performance.now() - start),
      });
    },
  });

  return result.toUIMessageStreamResponse({ originalMessages: messages });
});

export default chatRoute;
