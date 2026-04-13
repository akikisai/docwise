import { Mastra } from "@mastra/core";
import { PgVector } from "@mastra/pg";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import pg from "pg";
import { env } from "../env";
import { toError } from "../errors";

const pgVector = new PgVector({ id: "pgVector", connectionString: env.POSTGRES_CONNECTION_STRING });
export { pgVector };

const pool = new pg.Pool({ connectionString: env.POSTGRES_CONNECTION_STRING });

export const mastra = new Mastra({
  vectors: { pgVector },
});

export function ensureVectorIndex(): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    pgVector.createIndex({ indexName: "rag_chunks", dimension: 1536 }),
    (e) => e instanceof Error ? e : new Error(String(e))
  ).orElse((indexErr) => {
    const alreadyExists =
      indexErr.message.includes("already exists") || indexErr.message.includes("ALREADY_EXISTS");
    if (alreadyExists) return okAsync(undefined);
    return errAsync(indexErr);
  });
}

/** rag_chunks テーブルに tsvector カラム + GIN インデックス + トリガーを追加 */
export function ensureTsvectorColumn(): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    pool
      .query(`ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS tsv tsvector`)
      .then(() =>
        pool.query(`
          CREATE OR REPLACE FUNCTION rag_chunks_tsv_trigger() RETURNS trigger AS $$
          BEGIN
            NEW.tsv := to_tsvector('simple', COALESCE(NEW.metadata->>'text', ''));
            RETURN NEW;
          END
          $$ LANGUAGE plpgsql
        `),
      )
      .then(() => pool.query(`DROP TRIGGER IF EXISTS trg_rag_chunks_tsv ON "rag_chunks"`))
      .then(() =>
        pool.query(`
          CREATE TRIGGER trg_rag_chunks_tsv
            BEFORE INSERT OR UPDATE ON "rag_chunks"
            FOR EACH ROW
            EXECUTE FUNCTION rag_chunks_tsv_trigger()
        `),
      )
      .then(() =>
        pool.query(`
          UPDATE "rag_chunks"
          SET tsv = to_tsvector('simple', COALESCE(metadata->>'text', ''))
          WHERE tsv IS NULL
        `),
      )
      .then(() =>
        pool.query(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_tsv ON "rag_chunks" USING gin(tsv)`),
      )
      .then(() => undefined),
    toError,
  );
}
