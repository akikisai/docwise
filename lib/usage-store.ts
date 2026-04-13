import pg from "pg";
import { ResultAsync } from "neverthrow";
import { env } from "./env";
import { toError } from "./errors";

const pool = new pg.Pool({ connectionString: env.POSTGRES_CONNECTION_STRING });

export function ensureUsageTable(): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    pool.query(`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id       TEXT,
        step             TEXT NOT NULL,
        model            TEXT NOT NULL,
        prompt_tokens    INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_tokens     INT NOT NULL DEFAULT 0,
        latency_ms       INT NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).then(() => undefined),
    toError
  );
}

export type UsageRecord = {
  sessionId?: string;
  step: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};

/** NaN/undefinedを0に正規化 */
function safeInt(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** 非同期でDBに保存。呼び出し元をブロックしない */
export function recordUsage(record: UsageRecord): void {
  pool
    .query(
      `INSERT INTO llm_usage (session_id, step, model, prompt_tokens, completion_tokens, total_tokens, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.sessionId ?? null,
        record.step,
        record.model,
        safeInt(record.promptTokens),
        safeInt(record.completionTokens),
        safeInt(record.totalTokens),
        safeInt(record.latencyMs),
      ]
    )
    .catch((err: unknown) => console.error("[usage] 記録失敗:", err));
}

export type DailyUsageSummary = {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  byStep: Array<{
    step: string;
    count: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
  }>;
};

type SummaryRow = {
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  avg_latency_ms: number;
};

type StepRow = {
  step: string;
  count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  avg_latency_ms: number;
};

export function getTodayUsage(): ResultAsync<DailyUsageSummary, Error> {
  return ResultAsync.fromPromise(
    (async () => {
      const [summaryRes, byStepRes] = await Promise.all([
        pool.query<SummaryRow>(
          `SELECT
             COUNT(*)::int            AS total_requests,
             COALESCE(SUM(prompt_tokens), 0)::int     AS total_prompt_tokens,
             COALESCE(SUM(completion_tokens), 0)::int  AS total_completion_tokens,
             COALESCE(SUM(total_tokens), 0)::int       AS total_tokens,
             COALESCE(AVG(latency_ms), 0)::int         AS avg_latency_ms
           FROM llm_usage
           WHERE created_at >= CURRENT_DATE`
        ),
        pool.query<StepRow>(
          `SELECT
             step,
             COUNT(*)::int            AS count,
             COALESCE(SUM(prompt_tokens), 0)::int     AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0)::int  AS completion_tokens,
             COALESCE(SUM(total_tokens), 0)::int       AS total_tokens,
             COALESCE(AVG(latency_ms), 0)::int         AS avg_latency_ms
           FROM llm_usage
           WHERE created_at >= CURRENT_DATE
           GROUP BY step
           ORDER BY total_tokens DESC`
        ),
      ]);

      const s = summaryRes.rows[0];
      return {
        totalRequests: s?.total_requests ?? 0,
        totalPromptTokens: s?.total_prompt_tokens ?? 0,
        totalCompletionTokens: s?.total_completion_tokens ?? 0,
        totalTokens: s?.total_tokens ?? 0,
        avgLatencyMs: s?.avg_latency_ms ?? 0,
        byStep: byStepRes.rows.map((r) => ({
          step: r.step,
          count: r.count,
          promptTokens: r.prompt_tokens,
          completionTokens: r.completion_tokens,
          totalTokens: r.total_tokens,
          avgLatencyMs: r.avg_latency_ms,
        })),
      };
    })(),
    toError
  );
}
