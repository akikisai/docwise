import { useRef, useState } from "react";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { API_BASE } from "../lib/api";
import type { UploadResponse, JobResponse, JobStatus, FileType } from "../../../../packages/shared/src/types";

export type UploadedFile = {
  jobId: string;
  fileId?: string;
  fileName: string;
  fileType: FileType;
  status: JobStatus;
  chunkCount?: number;
};

export function UploadUI({
  onUploadStart,
  onStatusUpdate,
}: {
  onUploadStart: (file: UploadedFile) => void;
  onStatusUpdate: (jobId: string, updates: Partial<UploadedFile>) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsUploading(true);
    const formPayload = new FormData();
    formPayload.append("file", selectedFile);

    const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formPayload,
    });

    if (!uploadResponse.ok) {
      const errorData: { error: string } = await uploadResponse.json();
      alert(errorData.error);
      setIsUploading(false);
      return;
    }

    const uploadData: UploadResponse = await uploadResponse.json();

    const pendingFile: UploadedFile = {
      jobId: uploadData.jobId,
      fileName: uploadData.fileName,
      fileType: uploadData.fileType,
      status: "processing",
    };
    onUploadStart(pendingFile);
    setIsUploading(false);

    const pollingInterval = setInterval(async () => {
      const statusResponse = await fetch(
        `${API_BASE}/api/upload/status?jobId=${encodeURIComponent(uploadData.jobId)}`
      );
      const jobStatus: JobResponse = await statusResponse.json();

      if (jobStatus.status === "done") {
        clearInterval(pollingInterval);
        onStatusUpdate(uploadData.jobId, {
          status: "done",
          fileId: jobStatus.fileId,
          chunkCount: jobStatus.chunkCount,
        });
      } else if (jobStatus.status === "uploaded") {
        onStatusUpdate(uploadData.jobId, {
          status: "uploaded",
          fileId: jobStatus.fileId,
        });
      } else if (jobStatus.status === "error") {
        clearInterval(pollingInterval);
        onStatusUpdate(uploadData.jobId, { status: "error" });
      }
    }, 1000);
  };

  return (
    <div className="flex items-center gap-3 pb-3 mb-1 border-b border-border-subtle">
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleFileUpload}
        disabled={isUploading}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md
                   bg-accent text-accent-foreground hover:bg-accent-hover
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all active:scale-[0.98]"
      >
        <UploadSimpleIcon size={14} weight="bold" />
        <span>アップロード</span>
      </button>
      <p className="text-[11px] text-muted-foreground">
        PDF / PNG / JPG（20MB以下）
      </p>
    </div>
  );
}
