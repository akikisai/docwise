import type { z } from "zod";
import type {
  chatMessageSchema,
  chatRequestSchema,
  chunkMetadataSchema,
  uploadStatusQuerySchema,
} from "./schemas";

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type UploadStatusQuery = z.infer<typeof uploadStatusQuerySchema>;

export type JobStatus = "processing" | "uploaded" | "done" | "error";
export type FileType = "pdf" | "image" | "md" | "txt";
export type UploadType = 0 | 1;

/** rag_chunksインデックスの各チャンクメタデータ */
export type ChunkMetadata = z.infer<typeof chunkMetadataSchema>;

/** クエリの複雑さ分類 */
export type QueryComplexity = "simple" | "moderate" | "complex";

export interface JobResponse {
  id: string;
  status: JobStatus;
  fileName: string;
  fileType: FileType;
  fileId?: string;
  chunkCount?: number;
  error?: string;
  createdAt: string;
}

export interface UploadResponse {
  jobId: string;
  fileName: string;
  fileType: FileType;
  status: "processing";
}

export interface FileRecord {
  fileId: string;
  fileName: string;
  fileType: FileType;
  uploadType: UploadType;
  chunkCount: number;
}

export interface DeleteResponse {
  success: boolean;
  fileId: string;
}

export interface LocalFileEntry {
  relativePath: string;
  fileName: string;
  fileType: FileType;
  sizeBytes: number;
}

export interface LocalSyncStatus {
  jobId: string;
  status: "idle" | "syncing" | "done" | "error";
  totalFiles: number;
  processedFiles: number;
  error?: string;
}
