import { z } from "zod";

const envSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "GOOGLE_GENERATIVE_AI_API_KEY is required"),
  POSTGRES_CONNECTION_STRING: z.string().min(1, "POSTGRES_CONNECTION_STRING is required"),
  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_REGION: z.string().default("ap-northeast-1"),
  S3_FORCE_PATH_STYLE: z.string().default("true"),
  PORT: z.string().default("3001"),
  LOCAL_FOLDER_PATH: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`[env] Missing or invalid environment variables:\n${missing}`);
  process.exit(1);
}

export const env = parsed.data;
