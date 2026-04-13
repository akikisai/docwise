import type { LocalSyncStatus } from "../packages/shared/src/types";

const syncJobs = new Map<string, LocalSyncStatus>();

export const SyncJobStore = {
  create(jobId: string, totalFiles: number): void {
    syncJobs.set(jobId, {
      jobId,
      status: "syncing",
      totalFiles,
      processedFiles: 0,
    });
  },

  increment(jobId: string): void {
    const job = syncJobs.get(jobId);
    if (job) {
      syncJobs.set(jobId, { ...job, processedFiles: job.processedFiles + 1 });
    }
  },

  markDone(jobId: string): void {
    const job = syncJobs.get(jobId);
    if (job) {
      syncJobs.set(jobId, { ...job, status: "done", processedFiles: job.totalFiles });
    }
  },

  markError(jobId: string, errorMessage: string): void {
    const job = syncJobs.get(jobId);
    if (job) {
      syncJobs.set(jobId, { ...job, status: "error", error: errorMessage });
    }
  },

  find(jobId: string): LocalSyncStatus | undefined {
    return syncJobs.get(jobId);
  },
};
