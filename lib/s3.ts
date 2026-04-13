import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { ResultAsync, errAsync } from "neverthrow";
import { env } from "./env";
import { toError } from "./errors";

export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const BUCKET = env.S3_BUCKET;

// S3バケットの存在確認と作成（存在しない場合）
export function ensureBucket(): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    s3Client.send(new HeadBucketCommand({ Bucket: BUCKET })).then(() => undefined),
    (e) => ({
      raw: e,
      httpStatus: (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode,
    })
  ).orElse(({ raw, httpStatus }) => {
    if (httpStatus === 404) {
      return ResultAsync.fromPromise(
        s3Client.send(new CreateBucketCommand({ Bucket: BUCKET })).then(() => undefined),
        toError
      );
    }
    return errAsync(toError(raw));
  });
}

// S3へのファイルアップロード
export function uploadToS3(
  s3Key: string,
  fileBuffer: Buffer,
  contentType: string
): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    s3Client
      .send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: contentType,
        })
      )
      .then(() => undefined),
    toError
  );
}

// S3からファイルをBase64形式で取得
export function getFileAsBase64(s3Key: string): ResultAsync<
  { base64: string; contentType: string },
  Error
> {
  return ResultAsync.fromPromise(
    s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })).then(
      async (response) => {
        if (!response.Body) {
          throw new Error(`S3 オブジェクトの本文が空です: ${s3Key}`);
        }
        const bytes = await response.Body.transformToByteArray();
        return {
          base64: Buffer.from(bytes).toString("base64"),
          contentType: response.ContentType ?? "application/octet-stream",
        };
      }
    ),
    toError
  );
}

// S3からファイルを削除
export function deleteFromS3(s3Key: string): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    s3Client
      .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }))
      .then(() => undefined),
    toError
  );
}
