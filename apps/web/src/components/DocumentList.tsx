import {
  FilePdfIcon,
  ImageSquareIcon,
  FileTextIcon,
  TrashIcon,
  FileArrowUpIcon,
} from "@phosphor-icons/react";
import type { UploadedFile } from "./UploadUI";
import { API_BASE } from "../lib/api";
import { StatusBadge, type StatusBadgeVariant } from "./ui/StatusBadge";
import { EmptyState } from "./ui/EmptyState";
import { IconButton } from "./ui/IconButton";

const statusLabel: Record<StatusBadgeVariant, string> = {
  processing: "アップロード中",
  uploaded: "登録済",
  done: "登録済",
  error: "失敗",
};

export function DocumentList({
  files,
  onDelete,
}: {
  files: UploadedFile[];
  onDelete: (fileId: string) => void;
}) {
  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("このファイルと関連する検索データを削除しますか？")) return;
    try {
      const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE /api/files/${fileId} failed: ${res.status}`);
      onDelete(fileId);
    } catch (err) {
      console.error("[DocumentList] Failed to delete file:", err);
      alert("ファイルの削除に失敗しました。再試行してください。");
    }
  };

  if (files.length === 0) {
    return (
      <EmptyState
        icon={FileArrowUpIcon}
        description="ファイルをアップロードして検索対象に追加"
      />
    );
  }

  return (
    <div className="space-y-0.5">
      {files.map((file, idx) => (
        <div
          key={file.fileId ?? file.jobId}
          className="group flex items-center gap-2 py-1.5 px-1 text-xs rounded hover:bg-surface-secondary transition-colors animate-slide-up"
          style={{ animationDelay: `${idx * 50}ms`, animationFillMode: "backwards" }}
        >
          <span className="text-muted-foreground shrink-0">
            {file.fileType === "pdf" ? (
              <FilePdfIcon size={16} weight="duotone" />
            ) : file.fileType === "image" ? (
              <ImageSquareIcon size={16} weight="duotone" />
            ) : (
              <FileTextIcon size={16} weight="duotone" />
            )}
          </span>
          <span
            className="flex-1 min-w-0 truncate text-foreground"
            title={file.fileName}
          >
            {file.fileName}
          </span>
          <span className="shrink-0 text-muted-foreground font-mono">
            {file.status === "done"
              ? `${file.chunkCount} chunks`
              : file.status === "error"
                ? "失敗"
                : file.status === "uploaded"
                  ? "登録中…"
                  : "処理中…"}
          </span>
          <StatusBadge variant={file.status} label={statusLabel[file.status]} />
          {(file.status === "done" || file.status === "uploaded") && file.fileId && (
            <IconButton
              variant="danger"
              onClick={() => {
                if (file.fileId) handleDeleteFile(file.fileId);
              }}
              aria-label={`${file.fileName} を削除`}
            >
              <TrashIcon size={14} weight="bold" />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  );
}
