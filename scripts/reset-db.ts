import pg from "pg";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { env } from "../lib/env";

const pool = new pg.Pool({ connectionString: env.POSTGRES_CONNECTION_STRING });

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

async function resetDb() {
  console.info("[reset] テーブル・インデックスを削除中...");
  await pool.query("DROP TABLE IF EXISTS files CASCADE");
  await pool.query("DROP TABLE IF EXISTS llm_usage CASCADE");
  await pool.query('DROP TABLE IF EXISTS "rag_chunks" CASCADE');
  console.info("[reset] テーブル削除完了");
}

async function resetS3() {
  const bucket = env.S3_BUCKET;
  console.info(`[reset] S3バケット ${bucket} のオブジェクトを削除中...`);

  let continuationToken: string | undefined;
  let deletedCount = 0;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    const objects = list.Contents;
    if (objects && objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map((o) => ({ Key: o.Key })),
          },
        })
      );
      deletedCount += objects.length;
    }

    continuationToken = list.IsTruncated
      ? list.NextContinuationToken
      : undefined;
  } while (continuationToken);

  console.info(`[reset] S3オブジェクト ${deletedCount} 件削除完了`);
}

async function main() {
  try {
    await resetDb();
    await resetS3();
    console.info("[reset] リセット完了。BFFを再起動するとテーブルが再作成されます。");
  } catch (err) {
    console.error("[reset] リセット失敗:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();
