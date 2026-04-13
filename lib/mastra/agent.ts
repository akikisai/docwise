// --------------------------------------------------------------------------
// Agentic RAG エージェント設定
//
// complex と判定されたクエリに対して使用する。
// LLM が検索の手段・回数・粒度を自律的に判断し、最大3ステップで回答する。
//
// ツール:
//   keywordSearch  — tsvector + ts_rank で完全一致検索
//   semanticSearch — ベクトル類似度検索
//   chunkDeepRead  — 特定チャンクの前後コンテキスト取得
// --------------------------------------------------------------------------

import { keywordSearchTool } from "./tools/keyword-search";
import { semanticSearchTool } from "./tools/semantic-search";
import { chunkDeepReadTool } from "./tools/chunk-deep-read";

export const agentTools = {
  keywordSearch: keywordSearchTool,
  semanticSearch: semanticSearchTool,
  chunkDeepRead: chunkDeepReadTool,
};

export const AGENT_MAX_STEPS = 3;
