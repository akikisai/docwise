import type { JobStatus, FileType } from "../packages/shared/src/types";
export type { JobStatus, FileType };

export interface Job {
  id: string;
  status: JobStatus;
  fileName: string;
  fileType: FileType;
  fileId?: string;
  chunkCount?: number;
  error?: string;
  createdAt: Date;
}

const jobs = new Map<string, Job>();

// インメモリのジョブストア（簡易実装。将来永続化や分散対応が必要になったらDBに移行）
export const JobStore = {
  create(id: string, fileName: string, fileType: FileType): void {
    jobs.set(id, {
      id,
      status: "processing",
      fileName,
      fileType,
      createdAt: new Date(),
    });
  },

  markUploaded(id: string, fileId: string): void {
    const job = jobs.get(id);
    if (job) {
      jobs.set(id, { ...job, status: "uploaded", fileId });
    }
  },

  markDone(id: string, fileId: string, chunkCount: number): void {
    const job = jobs.get(id);
    if (job) {
      jobs.set(id, { ...job, status: "done", fileId, chunkCount });
    }
  },

  markFailed(id: string, errorMessage: string): void {
    const job = jobs.get(id);
    if (job) {
      jobs.set(id, { ...job, status: "error", error: errorMessage });
    }
  },

  find(id: string): Job | undefined {
    return jobs.get(id);
  },
};
