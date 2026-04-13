import { tool } from "ai";
import { z } from "zod";
import pg from "pg";
import { env } from "../../env";
import { findFileById } from "../../file-store";

const pool = new pg.Pool({ connectionString: env.POSTGRES_CONNECTION_STRING });

export interface DeepReadChunk {
  text: string;
  chunkIndex?: number;
}

export const chunkDeepReadTool = tool({
  description: `特定チャンクの前後コンテキストを取得する。検索結果の深掘りに使う。

USE WHEN:
- 検索でヒットしたチャンクの前後の文脈を知りたいとき
- 検索結果が断片的で、もう少し詳しい情報が必要なとき

DO NOT USE:
- まだ検索を1回もしていないとき（先に keywordSearch か semanticSearch を使うこと）`,
  inputSchema: z.object({
    fileId: z.string().describe("深掘り対象のチャンクの fileId"),
    chunkIndex: z.number().optional().describe("チャンクのインデックス番号（わかる場合）"),
    window: z.number().optional().describe("前後何チャンク分取得するか（デフォルト: 2）"),
  }),
  execute: async ({ fileId, chunkIndex, window: windowParam }) => {
    const windowSize = windowParam ?? 2;
    let chunks: DeepReadChunk[];

    if (chunkIndex !== undefined) {
      const minIdx = Math.max(0, chunkIndex - windowSize);
      const maxIdx = chunkIndex + windowSize;
      const result = await pool.query<{ text: string | null; chunk_index: string | null }>(
        `SELECT metadata->>'text' AS text,
                metadata->>'chunkIndex' AS chunk_index
         FROM "rag_chunks"
         WHERE metadata->>'fileId' = $1
           AND (metadata->>'chunkIndex')::int BETWEEN $2 AND $3
         ORDER BY (metadata->>'chunkIndex')::int`,
        [fileId, minIdx, maxIdx],
      );
      chunks = result.rows.map((r) => ({
        text: r.text ?? "",
        chunkIndex: r.chunk_index ? parseInt(r.chunk_index, 10) : undefined,
      }));
    } else {
      const result = await pool.query<{ text: string | null }>(
        `SELECT metadata->>'text' AS text
         FROM "rag_chunks"
         WHERE metadata->>'fileId' = $1
         LIMIT 10`,
        [fileId],
      );
      chunks = result.rows.map((r) => ({ text: r.text ?? "" }));
    }

    const fileResult = await findFileById(fileId);
    const fileName = fileResult.isOk() && fileResult.value ? fileResult.value.fileName : fileId;

    return { chunks, totalChunks: chunks.length, fileName };
  },
});
