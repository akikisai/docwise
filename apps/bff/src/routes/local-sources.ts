import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { generateId } from "ai";
import { ResultAsync } from "neverthrow";
import { env } from "../../../../lib/env";
import { scanLocalFolder, resolveSafePath } from "../../../../lib/local-source";
import { SyncJobStore } from "../../../../lib/sync-job-store";
import { listFileIdsByUploadType, deleteFilesByUploadType } from "../../../../lib/file-store";
import { pgVector } from "../../../../lib/mastra/index";
import { localSyncStatusQuerySchema } from "../../../../packages/shared/src/schemas";
import { toError } from "../../../../lib/errors";
import { indexLocalFile } from "../../../../lib/local-indexing";

const localSourcesRoute = new Hono();

// フォルダ内ファイル一覧取得
localSourcesRoute.get("/files", async (c) => {
  const basePath = env.LOCAL_FOLDER_PATH;
  if (!basePath) {
    return c.json({ error: "LOCAL_FOLDER_PATH が設定されていません" }, 400);
  }

  const result = await scanLocalFolder(basePath);

  if (result.isErr()) {
    console.error("[local-sources] フォルダスキャン失敗:", result.error.message);
    return c.json({ error: "フォルダの読み取りに失敗しました" }, 500);
  }

  return c.json({ files: result.value, folderPath: basePath });
});

// 全削除→再取り込み
localSourcesRoute.post("/sync", async (c) => {
  const basePath = env.LOCAL_FOLDER_PATH;
  if (!basePath) {
    return c.json({ error: "LOCAL_FOLDER_PATH が設定されていません" }, 400);
  }

  const scanResult = await scanLocalFolder(basePath);
  if (scanResult.isErr()) {
    console.error("[local-sources] フォルダスキャン失敗:", scanResult.error.message);
    return c.json({ error: "フォルダの読み取りに失敗しました" }, 500);
  }

  const files = scanResult.value;
  if (files.length === 0) {
    return c.json({ error: "取り込み対象のファイルがありません" }, 400);
  }

  const jobId = generateId();
  SyncJobStore.create(jobId, files.length);

  // バックグラウンドで非同期処理
  void (async () => {
    // 1. 既存のローカルファイルのベクトルを全削除
    const existingFileIds = await listFileIdsByUploadType(1);
    if (existingFileIds.isErr()) {
      SyncJobStore.markError(jobId, existingFileIds.error.message);
      return;
    }

    for (const fileId of existingFileIds.value) {
      const deleteResult = await ResultAsync.fromPromise(
        pgVector.deleteVectors({ indexName: "rag_chunks", filter: { fileId } }),
        toError
      );
      if (deleteResult.isErr()) {
        console.error(`[local-sources] ベクトル削除失敗 (fileId=${fileId}):`, deleteResult.error.message);
      }
    }

    // 2. 既存のローカルファイルレコードを全削除
    const deleteFilesResult = await deleteFilesByUploadType(1);
    if (deleteFilesResult.isErr()) {
      SyncJobStore.markError(jobId, deleteFilesResult.error.message);
      return;
    }

    // 3. 全ファイルを順次取り込み
    for (const file of files) {
      const fileId = generateId();
      const resolveResult = await resolveSafePath(basePath, file.relativePath);
      if (resolveResult.isErr()) {
        console.error(`[local-sources] パス検証失敗: ${file.relativePath}`, resolveResult.error.message);
        SyncJobStore.increment(jobId);
        continue;
      }

      const fullPath = resolveResult.value;
      const result = await indexLocalFile({
        fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        fullPath,
        relativePath: file.relativePath,
      });

      if (result.isErr()) {
        console.error(`[local-sources] ファイル取り込み失敗: ${file.relativePath}`, result.error.message);
      }

      SyncJobStore.increment(jobId);
    }

    SyncJobStore.markDone(jobId);
  })();

  return c.json({ jobId, totalFiles: files.length, status: "syncing" });
});

// 取り込み状況確認
localSourcesRoute.get(
  "/sync/status",
  zValidator("query", localSyncStatusQuerySchema),
  async (c) => {
    const { jobId } = c.req.valid("query");
    const job = SyncJobStore.find(jobId);

    if (!job) {
      return c.json({ error: "ジョブが見つかりません" }, 404);
    }

    return c.json(job);
  }
);

// ローカル取り込みデータ全削除
localSourcesRoute.delete("/data", async (c) => {
  const existingFileIds = await listFileIdsByUploadType(1);
  if (existingFileIds.isErr()) {
    console.error("[local-sources] ファイルID取得失敗:", existingFileIds.error.message);
    return c.json({ error: "削除対象の取得に失敗しました" }, 500);
  }

  if (existingFileIds.value.length === 0) {
    return c.json({ deletedFiles: 0 });
  }

  for (const fileId of existingFileIds.value) {
    const deleteResult = await ResultAsync.fromPromise(
      pgVector.deleteVectors({ indexName: "rag_chunks", filter: { fileId } }),
      toError
    );
    if (deleteResult.isErr()) {
      console.error(`[local-sources] ベクトル削除失敗 (fileId=${fileId}):`, deleteResult.error.message);
    }
  }

  const deleteFilesResult = await deleteFilesByUploadType(1);
  if (deleteFilesResult.isErr()) {
    console.error("[local-sources] ファイルレコード削除失敗:", deleteFilesResult.error.message);
    return c.json({ error: "ファイルレコードの削除に失敗しました" }, 500);
  }

  return c.json({ deletedFiles: deleteFilesResult.value });
});

export default localSourcesRoute;
