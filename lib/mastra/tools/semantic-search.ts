import { tool, embed } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { pgVector } from "../index";
import { parseChunkMetadata } from "../../../packages/shared/src/schemas";
import { findFileById } from "../../file-store";

export interface SemanticSearchResult {
  id: string;
  text: string;
  fileId: string;
  score: number;
  chunkIndex?: number;
}

/**
 * ベクトル類似度検索。
 * moderate ルートのハイブリッド検索でも使う。
 */
export async function runSemanticSearch(query: string): Promise<SemanticSearchResult[]> {
  const { embedding } = await embed({
    model: google.embeddingModel("gemini-embedding-001"),
    value: query,
    providerOptions: { google: { outputDimensionality: 1536 } },
  });

  const results = await pgVector.query({
    indexName: "rag_chunks",
    queryVector: embedding,
    topK: 5,
    includeVector: false,
    minScore: 0.3,
  });

  return results.map((r) => {
    const meta = parseChunkMetadata(r.metadata);
    return {
      id: r.id,
      text: meta?.text ?? "",
      fileId: meta?.fileId ?? "",
      score: r.score,
      chunkIndex: meta?.chunkIndex,
    };
  });
}

export const semanticSearchTool = tool({
  description: `意味的類似度検索。ベクトル検索でドキュメントチャンクを検索する。

USE WHEN:
- 概念的な質問・言い換え・抽象的な質問のとき
- キーワード検索では取りこぼす可能性がある質問のとき

DO NOT USE:
- 固有名詞・品番・日付など完全一致が必要なとき（keywordSearch を使うこと）
- 既に十分な検索結果がある場合`,
  inputSchema: z.object({
    query: z.string().describe("検索クエリ（自然言語）"),
  }),
  execute: async ({ query }) => {
    const results = await runSemanticSearch(query);
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
