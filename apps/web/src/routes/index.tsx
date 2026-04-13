import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { UploadUI, type UploadedFile } from "../components/UploadUI";
import { DocumentList } from "../components/DocumentList";
import { ChatUI } from "../components/ChatUI";
import { LocalSourceUI } from "../components/LocalSourceUI";
import { FolderOpenIcon, ChatsCircleIcon, FolderSimpleIcon, FilesIcon } from "@phosphor-icons/react";
import { SectionHeader } from "../components/ui/SectionHeader";
import { API_BASE } from "../lib/api";
import type { FileRecord } from "../../../../packages/shared/src/types";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const loadFiles = useCallback(() => {
    fetch(`${API_BASE}/api/files`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/files failed: ${res.status}`);
        return res.json();
      })
      .then((data: { files: FileRecord[] }) => {
        setFiles(
          data.files.map((f) => ({
            jobId: f.fileId,
            fileId: f.fileId,
            fileName: f.fileName,
            fileType: f.fileType,
            status: "done" as const,
            chunkCount: f.chunkCount,
          }))
        );
      })
      .catch((err) => {
        console.error("[files] Failed to load indexed files:", err);
      });
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUploadStart = (pendingFile: UploadedFile) => {
    setFiles((prev) => [pendingFile, ...prev]);
  };

  const handleStatusUpdate = (jobId: string, updates: Partial<UploadedFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.jobId === jobId ? { ...f, ...updates } : f))
    );
  };

  const handleDeleteFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* ドキュメント管理 */}
      <div className="w-[380px] shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="px-5 pt-5 pb-4 border-b border-border space-y-4">
          <SectionHeader icon={FolderOpenIcon} title="ドキュメント管理" />
        </div>

        {/* フォルダ連携 */}
        <div className="px-5 py-4 border-b border-border space-y-3">
          <SectionHeader icon={FolderSimpleIcon} title="フォルダ連携" />
          <LocalSourceUI onSyncComplete={loadFiles} />
        </div>

        {/* ファイル一覧 */}
        <div className="px-5 pt-3 pb-2 space-y-2">
          <SectionHeader icon={FilesIcon} title="ファイル一覧" />
          <UploadUI onUploadStart={handleUploadStart} onStatusUpdate={handleStatusUpdate} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <DocumentList
            files={files}
            onDelete={handleDeleteFile}
          />
        </div>
      </div>

      {/* チャット欄 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <SectionHeader
            icon={ChatsCircleIcon}
            title="ドキュメント検索"
            description="登録したすべてのファイルに横断検索できます。ファイルの内容に応じてお答えします。"
          />
        </div>
        <div className="flex-1 min-h-0">
          <ChatUI />
        </div>
      </div>
    </div>
  );
}
