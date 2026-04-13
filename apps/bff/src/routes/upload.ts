import { Hono } from "hono";
import { generateId } from "ai";
import { JobStore } from "../../../../lib/job-store";
import { indexPdf, indexImage } from "../../../../lib/indexing";
import type { UploadResponse } from "../../../../packages/shared/src/types";

type AcceptedFileType = "pdf" | "image";

const ACCEPTED_EXTENSIONS: Record<string, AcceptedFileType> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const uploadRoute = new Hono();

uploadRoute.post("/", async (c) => {
  const formData = await c.req.formData();
  const uploadedFile = formData.get("file");

  if (!(uploadedFile instanceof File)) {
    return c.json({ error: "ファイルを選択してください" }, 400);
  }

  if (uploadedFile.size > MAX_UPLOAD_BYTES) {
    return c.json(
      { error: "ファイルサイズは20MB以下にしてください" },
      413
    );
  }

  const extension =
    uploadedFile.name.split(".").pop()?.toLowerCase() ?? "";
  const fileType = ACCEPTED_EXTENSIONS[extension];

  if (!fileType) {
    return c.json(
      { error: "対応していないファイル形式です（PDF / PNG / JPG）" },
      400
    );
  }

  const fileId = generateId();
  const jobId = generateId();
  const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());

  JobStore.create(jobId, uploadedFile.name, fileType);

  if (fileType === "pdf") {
    void indexPdf({
      jobId,
      fileId,
      fileName: uploadedFile.name,
      pdfBuffer: fileBuffer,
    });
  } else {
    void indexImage({
      jobId,
      fileId,
      fileName: uploadedFile.name,
      imageBuffer: fileBuffer,
      contentType: uploadedFile.type,
    });
  }

  return c.json({
    jobId,
    fileName: uploadedFile.name,
    fileType,
    status: "processing",
  } satisfies UploadResponse);
});

export default uploadRoute;
