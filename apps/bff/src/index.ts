import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import uploadRoute from "./routes/upload";
import uploadStatusRoute from "./routes/upload-status";
import filesRoute from "./routes/files";
import chatRoute from "./routes/chat";
import usageRoute from "./routes/usage";
import localSourcesRoute from "./routes/local-sources";
import { ensureVectorIndex, ensureTsvectorColumn } from "../../../lib/mastra/index";
import { ensureBucket } from "../../../lib/s3";
import { ensureUsageTable } from "../../../lib/usage-store";
import { ensureFilesTable } from "../../../lib/file-store";
import { env } from "../../../lib/env";

const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:8080",
  ],
}));

app.route("/api/upload", uploadRoute);
app.route("/api/upload/status", uploadStatusRoute);
app.route("/api/files", filesRoute);
app.route("/api/chat", chatRoute);
app.route("/api/usage", usageRoute);
app.route("/api/local-sources", localSourcesRoute);

app.onError((err, c) => {
  console.error("[BFF] Unhandled error:", err);
  return c.json({ error: "内部エラーが発生しました" }, 500);
});

app.notFound((c) => c.json({ error: "ページが見つかりません" }, 404));

const start = async () => {
  const bucketResult = await ensureBucket();
  if (bucketResult.isErr()) {
    console.error("[BFF] MinIO bucket初期化失敗:", bucketResult.error.message);
    process.exit(1);
  }

  const indexResult = await ensureVectorIndex();
  if (indexResult.isErr()) {
    console.error("[BFF] Vector index初期化失敗:", indexResult.error.message);
    process.exit(1);
  }

  const tsvResult = await ensureTsvectorColumn();
  if (tsvResult.isErr()) {
    console.error("[BFF] tsvector初期化失敗:", tsvResult.error.message);
    process.exit(1);
  }

  const usageResult = await ensureUsageTable();
  if (usageResult.isErr()) {
    console.error("[BFF] llm_usageテーブル初期化失敗:", usageResult.error.message);
    process.exit(1);
  }

  const filesTableResult = await ensureFilesTable();
  if (filesTableResult.isErr()) {
    console.error("[BFF] filesテーブル初期化失敗:", filesTableResult.error.message);
    process.exit(1);
  }

  const port = Number(env.PORT);
  serve({ fetch: app.fetch, port }, (info) => {
    console.info(`Hono BFF running on http://localhost:${info.port}`);
  });
};

void start();
