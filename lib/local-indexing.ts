import { ResultAsync } from "neverthrow";
import { insertFile } from "./file-store";
import { cleanseWithGemini } from "./cleansing";
import { toError } from "./errors";
import { parseFile } from "./parsers/index";
import { computeFileHash } from "./local-source";
import { chunkDocument, embedChunks, upsertVectors } from "./indexing";
import type { FileType } from "../packages/shared/src/types";

export function indexLocalFile({
  fileId,
  fileName,
  fileType,
  fullPath,
  relativePath,
}: {
  fileId: string;
  fileName: string;
  fileType: FileType;
  fullPath: string;
  relativePath: string;
}): ResultAsync<number, Error> {
  return computeFileHash(fullPath)
    .andThen((contentHash) =>
      insertFile({
        fileId,
        fileName,
        fileType,
        uploadType: 1,
        sourcePath: relativePath,
        contentHash,
      })
    )
    .andThen(() => parseFile(fullPath, fileType))
    .andThen((rawText) => {
      if (!rawText.trim()) {
        return ResultAsync.fromPromise(Promise.resolve(""), toError);
      }
      // PDF のみ Gemini クレンジングを適用
      if (fileType === "pdf") {
        return cleanseWithGemini(rawText);
      }
      return ResultAsync.fromPromise(Promise.resolve(rawText), toError);
    })
    .andThen((text) => {
      if (!text.trim()) {
        return ResultAsync.fromPromise(Promise.resolve(0), toError);
      }
      return chunkDocument(text, { fileId })
        .andThen((chunks) =>
          embedChunks(chunks.map((c) => c.text)).map((embeddings) => ({ chunks, embeddings }))
        )
        .andThen(({ chunks, embeddings }) =>
          upsertVectors(chunks, embeddings, fileId).map(() => chunks.length)
        );
    });
}
