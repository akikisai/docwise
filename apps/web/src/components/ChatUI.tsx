import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef } from "react";
import {
  PaperPlaneRightIcon,
  ChatCircleDotsIcon,
  MagnifyingGlassIcon,
  BookOpenTextIcon,
} from "@phosphor-icons/react";
import { API_BASE } from "../lib/api";
import { EmptyState } from "./ui/EmptyState";
import { UsageBar } from "./UsageBar";

const chatTransport = new DefaultChatTransport({
  api: `${API_BASE}/api/chat`,
});

export function ChatUI() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({ transport: chatTransport });
  const isSending = status === "streaming" || status === "submitted";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={ChatCircleDotsIcon}
              description={
                <>
                  <p>登録したドキュメントに対して自然言語で検索・質問できます</p>
                  <p className="text-xs text-muted-foreground/60">
                    例: 「売上が好調だった時期は？」「この図の内容を説明して」
                  </p>
                </>
              }
            />
          </div>
        )}

        {messages.map((chatMessage, idx) => {
          const textContent = chatMessage.parts
            .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
            .map((p) => p.text)
            .join("");

          const toolParts = chatMessage.parts.filter(
            (p) => p.type === "dynamic-tool",
          );
          const hasTools = toolParts.length > 0;

          if (chatMessage.role === "user") {
            if (!textContent) return null;
            return (
              <div
                key={chatMessage.id}
                className="flex justify-end animate-slide-up"
                style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "backwards" }}
              >
                <div className="max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed bg-foreground text-background">
                  <span className="whitespace-pre-wrap">{textContent}</span>
                </div>
              </div>
            );
          }

          // assistant message
          const hasContent = textContent || hasTools;
          if (!hasContent) return null;

          return (
            <div
              key={chatMessage.id}
              className="flex justify-start animate-slide-up"
              style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "backwards" }}
            >
              <div className="max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed bg-surface border border-border-subtle text-foreground">
                {hasTools && (
                  <div className="mb-2 space-y-1 border-b border-border-subtle pb-2">
                    {toolParts.map((part) => {
                      if (part.type !== "dynamic-tool") return null;
                      return (
                        <SearchStepItem
                          key={part.toolCallId}
                          toolName={part.toolName}
                          state={part.state}
                          input={"input" in part ? part.input : undefined}
                          output={"output" in part ? part.output : undefined}
                        />
                      );
                    })}
                  </div>
                )}
                {textContent && <FormattedAssistantMessage text={textContent} />}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-surface border border-border-subtle rounded-lg px-4 py-2.5 text-sm text-muted-foreground">
              <MagnifyingGlassIcon size={14} weight="bold" className="animate-pulse" />
              検索・回答生成中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || isSending) return;
          sendMessage({ text: input });
          setInput("");
        }}
        className="shrink-0 border-t border-border px-6 py-4 flex gap-2"
      >
        <label className="sr-only" htmlFor="chat-input">
          質問を入力
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ドキュメントについて質問する..."
          className="flex-1 bg-surface border border-border rounded-lg px-3.5 py-2.5 text-sm
                     placeholder:text-muted-foreground/50
                     focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-accent
                     disabled:opacity-50 transition-all"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-lg text-sm font-medium
                     bg-foreground text-background
                     hover:bg-foreground/90
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all active:scale-[0.98]"
          aria-label="送信"
        >
          <PaperPlaneRightIcon size={16} weight="bold" />
        </button>
      </form>

      <UsageBar />
    </div>
  );
}

// --- Sub-components ---

const TOOL_LABELS: Record<string, string> = {
  keywordSearch: "キーワード検索",
  semanticSearch: "意味検索",
  chunkDeepRead: "文脈取得",
};

function SearchStepItem({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const query = extractQuery(input);
  const isLoading = state === "input-streaming" || state === "input-available";

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {toolName === "chunkDeepRead" ? (
        <BookOpenTextIcon size={12} weight="bold" className={isLoading ? "animate-pulse" : ""} />
      ) : (
        <MagnifyingGlassIcon size={12} weight="bold" className={isLoading ? "animate-pulse" : ""} />
      )}
      <span className="font-medium">{label}</span>
      {query && <span className="text-muted-foreground/60 truncate max-w-[180px]">"{query}"</span>}
      {state === "output-available" && (
        <span className="text-accent">→ {formatToolResult(output)}</span>
      )}
      {state === "output-error" && (
        <span className="text-destructive">→ エラー</span>
      )}
    </div>
  );
}

function FormattedAssistantMessage({ text }: { text: string }) {
  const citationMarker = "参照ファイル";
  const citationIndex = text.indexOf(citationMarker);

  if (citationIndex === -1) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const lineStart = text.lastIndexOf("\n", citationIndex);
  const splitAt = lineStart >= 0 ? lineStart : citationIndex;

  return (
    <>
      <span className="whitespace-pre-wrap">{text.slice(0, splitAt)}</span>
      <span className="block mt-2 pt-2 border-t border-border-subtle text-xs text-muted-foreground">
        {text.slice(splitAt).trim()}
      </span>
    </>
  );
}

// --- Helpers ---

function extractQuery(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const obj = input as Record<string, unknown>;
  const q = obj["query"];
  return typeof q === "string" ? q : undefined;
}

function formatToolResult(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const obj = result as Record<string, unknown>;
  const totalHits = obj["totalHits"];
  const totalChunks = obj["totalChunks"];
  if (typeof totalHits === "number") return `${totalHits}件`;
  if (typeof totalChunks === "number") return `${totalChunks}チャンク`;
  return "";
}
