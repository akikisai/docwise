import { tool } from "ai";
import { z } from "zod";
import pg from "pg";
import { env } from "../../env";
import { findFileById } from "../../file-store";

const pool = new pg.Pool({ connectionString: env.POSTGRES_CONNECTION_STRING });

export interface KeywordSearchResult {
  id: string;
  text: string;
  fileId: string;
  score: number;
}

/**
 * tsvector + plainto_tsquery によるキーワード検索。
 * moderate ルートのハイブリッド検索でも使う。
 */
export async function runKeywordSearch(query: string): Promise<KeywordSearchResult[]> {
  const result = await pool.query<{
    id: string;
    text: string | null;
    file_id: string | null;
    rank: number;
  }>(
    `SELECT id,
            metadata->>'text' AS text,
            metadata->>'fileId' AS file_id,
            ts_rank(tsv, plainto_tsquery('simple', $1)) AS rank
     FROM "rag_chunks"
     WHERE tsv @@ plainto_tsquery('simple', $1)
     ORDER BY rank DESC
     LIMIT 5`,
    [query],
  );

  return result.rows.map((row) => ({
    id: row.id,
    text: row.text ?? "",
    fileId: row.file_id ?? "",
    score: row.rank,
  }));
}

export const keywordSearchTool = tool({
  description: `キーワード完全一致検索。tsvector + ts_rank でドキュメントチャンクを検索する。

USE WHEN:
- 固有名詞・品番・日付・特定のキーワードで検索したいとき
- 意味的な検索では取りこぼす可能性がある具体的な用語を探すとき

DO NOT USE:
- 概念的・抽象的な質問のとき（semanticSearch を使うこと）
- 既に十分な検索結果がある場合`,
  inputSchema: z.object({
    query: z.string().describe("検索キーワード（スペース区切りで複数可）"),
  }),
  execute: async ({ query }) => {
    const results = await runKeywordSearch(query);
    const fileIds = [...new Set(results.map((r) => r.fileId).filter(Boolean))];
    const fileNames = new Map<string, string>();
    await Promise.all(
      fileIds.map(async (fid) => {
        const res = await findFileById(fid);
        if (res.isOk() && res.value) fileNames.set(fid, res.value.fileName);
      }),
    );
    const enriched = results.map((r) => ({
      ...r,
      fileName: fileNames.get(r.fileId) ?? r.fileId,
    }));
    return { results: enriched, totalHits: enriched.length };
  },
});
