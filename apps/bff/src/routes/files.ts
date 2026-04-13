import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ResultAsync } from "neverthrow";
import { pgVector } from "../../../../lib/mastra/index";
import { deleteFromS3 } from "../../../../lib/s3";
import { listFilesWithChunkCount, findFileById, deleteFile } from "../../../../lib/file-store";
import { fileIdParamSchema } from "../../../../packages/shared/src/schemas";
import type { DeleteResponse } from "../../../../packages/shared/src/types";
import { toError } from "../../../../lib/errors";

const filesRoute = new Hono();

// ファイル一覧の取得
filesRoute.get("/", async (c) => {
  const result = await listFilesWithChunkCount();

  if (result.isErr()) {
    console.error("[files] ファイル一覧の取得に失敗:", result.error.message);
    return c.json({ error: "ファイル一覧の取得に失敗しました" }, 500);
  }

  return c.json({ files: result.value });
});

filesRoute.delete("/:fileId", zValidator("param", fileIdParamSchema), async (c) => {
  const { fileId } = c.req.valid("param");

  const fileResult = await findFileById(fileId);

  if (fileResult.isErr()) {
    console.error("[files] ファイル検索に失敗:", fileResult.error.message);
    return c.json({ error: "ファイルの検索に失敗しました" }, 500);
  }

  const file = fileResult.value;
  if (!file) {
    return c.json({ error: `File not found: ${fileId}` }, 404);
  }

  const deleteVectorsResult = await ResultAsync.fromPromise(
    pgVector.deleteVectors({ indexName: "rag_chunks", filter: { fileId } }),
    toError
  );

  if (deleteVectorsResult.isErr()) {
    console.error("[files] ベクトル削除に失敗:", deleteVectorsResult.error.message);
    return c.json({ error: "ファイルの削除に失敗しました" }, 500);
  }

  const deleteFileResult = await deleteFile(fileId);
  if (deleteFileResult.isErr()) {
    console.error("[files] filesテーブル削除に失敗:", deleteFileResult.error.message);
    return c.json({ error: "ファイルの削除に失敗しました" }, 500);
  }

  if (file.s3Key) {
    const deleteS3Result = await deleteFromS3(file.s3Key);
    if (deleteS3Result.isErr()) {
      console.error("[files] S3 削除失敗:", deleteS3Result.error.message);
    }
  }

  return c.json({ success: true, fileId } satisfies DeleteResponse);
});

export default filesRoute;
