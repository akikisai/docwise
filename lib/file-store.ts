import pg from "pg";
import { ResultAsync } from "neverthrow";
import { env } from "./env";
import { toError } from "./errors";
import type { FileType, UploadType, FileRecord } from "../packages/shared/src/types";

const pool = new pg.Pool({ connectionString: env.POSTGRES_CONNECTION_STRING });

export function ensureFilesTable(): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        file_id      TEXT PRIMARY KEY,
        file_name    TEXT NOT NULL,
        file_type    TEXT NOT NULL CHECK (file_type IN ('pdf', 'image', 'md', 'txt')),
        s3_key       TEXT,
        upload_type  SMALLINT NOT NULL DEFAULT 0,
        source_path  TEXT,
        content_hash TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).then(() => undefined),
    toError
  );
}

export function insertFile(params: {
  fileId: string;
  fileName: string;
  fileType: FileType;
  s3Key?: string;
  uploadType: UploadType;
  sourcePath?: string;
  contentHash?: string;
}): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    pool.query(
      `INSERT INTO files (file_id, file_name, file_type, s3_key, upload_type, source_path, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [params.fileId, params.fileName, params.fileType, params.s3Key ?? null, params.uploadType, params.sourcePath ?? null, params.contentHash ?? null]
    ).then(() => undefined),
    toError
  );
}

type FileRow = {
  file_id: string;
  file_name: string;
  file_type: string;
  s3_key: string | null;
  upload_type: number;
  source_path: string | null;
  content_hash: string | null;
};

export function findFileById(
  fileId: string
): ResultAsync<{ fileId: string; fileName: string; fileType: FileType; s3Key: string | null; uploadType: UploadType } | undefined, Error> {
  return ResultAsync.fromPromise(
    pool.query<FileRow>(
      `SELECT file_id, file_name, file_type, s3_key, upload_type FROM files WHERE file_id = $1`,
      [fileId]
    ).then((res) => {
      const row = res.rows[0];
      if (!row) return undefined;
      return {
        fileId: row.file_id,
        fileName: row.file_name,
        fileType: row.file_type as FileType,
        s3Key: row.s3_key,
        uploadType: row.upload_type as UploadType,
      };
    }),
    toError
  );
}

type FileWithChunkRow = FileRow & { chunk_count: string };

export function listFilesWithChunkCount(): ResultAsync<FileRecord[], Error> {
  return ResultAsync.fromPromise(
    pool.query<FileWithChunkRow>(`
      SELECT f.file_id, f.file_name, f.file_type, f.s3_key, f.upload_type,
             COUNT(v.id)::text AS chunk_count
      FROM files f
      LEFT JOIN "rag_chunks" v
        ON v.metadata->>'fileId' = f.file_id
      GROUP BY f.file_id
      ORDER BY f.created_at DESC
    `).then((res) =>
      res.rows.map((row) => ({
        fileId: row.file_id,
        fileName: row.file_name,
        fileType: row.file_type as FileType,
        uploadType: row.upload_type as UploadType,
        chunkCount: parseInt(row.chunk_count, 10),
      }))
    ),
    toError
  );
}

export function deleteFile(fileId: string): ResultAsync<boolean, Error> {
  return ResultAsync.fromPromise(
    pool.query(`DELETE FROM files WHERE file_id = $1`, [fileId])
      .then((res) => (res.rowCount ?? 0) > 0),
    toError
  );
}

export function listFileIdsByUploadType(uploadType: UploadType): ResultAsync<string[], Error> {
  return ResultAsync.fromPromise(
    pool.query<{ file_id: string }>(
      `SELECT file_id FROM files WHERE upload_type = $1`,
      [uploadType]
    ).then((res) => res.rows.map((row) => row.file_id)),
    toError
  );
}

export function deleteFilesByUploadType(uploadType: UploadType): ResultAsync<number, Error> {
  return ResultAsync.fromPromise(
    pool.query(`DELETE FROM files WHERE upload_type = $1`, [uploadType])
      .then((res) => res.rowCount ?? 0),
    toError
  );
}
