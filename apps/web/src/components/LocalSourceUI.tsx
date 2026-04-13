import { useState, useEffect, useRef } from "react";
import {
  FolderIcon,
  ArrowsClockwiseIcon,
  FileTextIcon,
  FilePdfIcon,
  SpinnerIcon,
  CheckCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { API_BASE } from "../lib/api";
import { EmptyState } from "./ui/EmptyState";
import type { LocalFileEntry, LocalSyncStatus } from "../../../../packages/shared/src/types";

function fileIcon(fileType: string) {
  switch (fileType) {
    case "pdf":
      return <FilePdfIcon size={16} weight="duotone" />;
    default:
      return <FileTextIcon size={16} weight="duotone" />;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LocalSourceUI({
  onSyncComplete,
}: {
  onSyncComplete: () => void;
}) {
  const [files, setFiles] = useState<LocalFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<LocalSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folderConfigured, setFolderConfigured] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/local-sources/files`);
      if (!res.ok) {
        const data: { error: string } = await res.json();
        if (res.status === 400 && data.error.includes("LOCAL_FOLDER_PATH")) {
          setFolderConfigured(false);
          return;
        }
        throw new Error(data.error);
      }
      const data: { files: LocalFileEntry[] } = await res.json();
      setFiles(data.files);
      setFolderConfigured(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ファイル一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleSync = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/local-sources/sync`, { method: "POST" });
      if (!res.ok) {
        const data: { error: string } = await res.json();
        throw new Error(data.error);
      }
      const data: { jobId: string; totalFiles: number } = await res.json();
      setSyncStatus({
        jobId: data.jobId,
        status: "syncing",
        totalFiles: data.totalFiles,
        processedFiles: 0,
      });

      pollingRef.current = setInterval(async () => {
        const statusRes = await fetch(
          `${API_BASE}/api/local-sources/sync/status?jobId=${encodeURIComponent(data.jobId)}`
        );
        if (!statusRes.ok) return;
        const statusData: LocalSyncStatus = await statusRes.json();
        setSyncStatus(statusData);

        if (statusData.status === "done" || statusData.status === "error") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (statusData.status === "done") {
            onSyncComplete();
          }
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取り込みの開始に失敗しました");
    }
  };

  const isSyncing = syncStatus?.status === "syncing";
  const progressPercent =
    syncStatus && syncStatus.totalFiles > 0
      ? Math.round((syncStatus.processedFiles / syncStatus.totalFiles) * 100)
      : 0;

  const handleDeleteData = async () => {
    if (!confirm("フォルダ連携で取り込んだデータをすべて削除しますか？")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/local-sources/data`, { method: "DELETE" });
      if (!res.ok) {
        const data: { error: string } = await res.json();
        throw new Error(data.error);
      }
      setSyncStatus(null);
      onSyncComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  if (!folderConfigured) {
    return (
      <EmptyState
        icon={FolderIcon}
        description="LOCAL_FOLDER_PATH が未設定です。.env.local で設定してください。"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleSync}
          disabled={isSyncing || loading || files.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md
                     bg-accent text-accent-foreground hover:bg-accent-hover
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all active:scale-[0.98]"
        >
          <ArrowsClockwiseIcon size={14} weight="bold" className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "取り込み中…" : "取り込み"}
        </button>
        <button
          onClick={fetchFiles}
          disabled={loading || isSyncing}
          className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-md
                     text-muted-foreground hover:text-foreground hover:bg-surface-secondary
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all"
        >
          <ArrowsClockwiseIcon size={14} weight="bold" className={loading ? "animate-spin" : ""} />
          再スキャン
        </button>
        <button
          onClick={handleDeleteData}
          disabled={isSyncing || deleting}
          className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-md
                     text-muted-foreground hover:text-destructive hover:bg-destructive/10
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all"
        >
          <TrashIcon size={14} weight="bold" />
          {deleting ? "解除中…" : "連携解除"}
        </button>
      </div>

      {/* 進捗バー */}
      {syncStatus && isSyncing && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SpinnerIcon size={12} weight="bold" className="animate-spin" />
            <span>
              {syncStatus.processedFiles} / {syncStatus.totalFiles} ファイル処理済み
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {syncStatus?.status === "done" && (
        <div className="flex items-center gap-1.5 text-xs text-accent">
          <CheckCircleIcon size={14} weight="fill" />
          連携完了 ({syncStatus.totalFiles} ファイル)
        </div>
      )}

      {(error ?? syncStatus?.error) && (
        <p className="text-xs text-destructive">
          {error ?? syncStatus?.error}
        </p>
      )}

      {/* ファイル一覧 */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <SpinnerIcon size={14} weight="bold" className="animate-spin" />
          スキャン中…
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          対応ファイルが見つかりません
        </p>
      ) : (
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {files.length} ファイル検出
          </p>
          <div className="max-h-[240px] overflow-y-auto space-y-0.5">
            {files.map((file) => (
              <div
                key={file.relativePath}
                className="flex items-center gap-2 py-1.5 px-1 text-xs rounded hover:bg-surface-secondary transition-colors"
              >
                <span className="text-muted-foreground shrink-0">
                  {fileIcon(file.fileType)}
                </span>
                <span className="flex-1 min-w-0 truncate text-foreground" title={file.relativePath}>
                  {file.relativePath}
                </span>
                <span className="shrink-0 text-muted-foreground font-mono">
                  {formatBytes(file.sizeBytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
