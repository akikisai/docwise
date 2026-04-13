import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../lib/api";

type StepUsage = {
  step: string;
  count: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
};

type DailyUsageSummary = {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  byStep: StepUsage[];
};

const STEP_LABELS: Record<string, string> = {
  intent_classify: "Intent分類",
  stream_casual: "Casual応答",
  stream_knowledge: "Knowledge応答",
  embed_query: "クエリ埋め込み",
  embed_chunks: "チャンク埋め込み",
  cleanse_pdf: "PDFクレンジング",
  describe_image: "画像記述",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function UsageBar() {
  const [usage, setUsage] = useState<DailyUsageSummary | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchUsage = useCallback(() => {
    fetch(`${API_BASE}/api/usage/today`)
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchUsage();
    const id = setInterval(fetchUsage, 30_000);
    return () => clearInterval(id);
  }, [fetchUsage]);

  if (!usage || usage.totalRequests === 0) return null;

  return (
    <div className="shrink-0 border-t border-border-subtle bg-surface/50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>
          今日のLLM使用量: {formatTokens(usage.totalTokens)} tokens / {usage.totalRequests} calls / avg {usage.avgLatencyMs}ms
        </span>
        <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-6 pb-3">
          <table className="w-full text-xs text-muted-foreground">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-1 font-medium">ステップ</th>
                <th className="text-right py-1 font-medium">回数</th>
                <th className="text-right py-1 font-medium">入力</th>
                <th className="text-right py-1 font-medium">出力</th>
                <th className="text-right py-1 font-medium">合計</th>
                <th className="text-right py-1 font-medium">平均ms</th>
              </tr>
            </thead>
            <tbody>
              {usage.byStep.map((s) => (
                <tr key={s.step} className="border-b border-border-subtle/50">
                  <td className="py-1">{STEP_LABELS[s.step] ?? s.step}</td>
                  <td className="text-right py-1">{s.count}</td>
                  <td className="text-right py-1">{formatTokens(s.promptTokens)}</td>
                  <td className="text-right py-1">{formatTokens(s.completionTokens)}</td>
                  <td className="text-right py-1">{formatTokens(s.totalTokens)}</td>
                  <td className="text-right py-1">{s.avgLatencyMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
