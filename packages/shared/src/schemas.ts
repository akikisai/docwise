import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
});

export const uploadStatusQuerySchema = z.object({
  jobId: z.string().min(1, "jobIdは必須です"),
});

export const fileIdParamSchema = z.object({
  fileId: z.string().min(1),
});

// AI SDKのUIMessage形式に対応するチャットAPIリクエストスキーマ
const uiMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system", "tool", "data"]),
    content: z.unknown().optional(),
    parts: z.array(z.object({ type: z.string() }).passthrough()).optional(),
  })
  .passthrough();

export const uiChatRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1, "messages は1件以上必要です"),
});

export type UiChatRequest = z.infer<typeof uiChatRequestSchema>;

// rag_chunksインデックスのmetadata構造
export const chunkMetadataSchema = z.object({
  fileId: z.string(),
  text: z.string().optional(),
  chunkIndex: z.number().optional(),
});

const partialChunkMetadataSchema = chunkMetadataSchema.partial();

export function parseChunkMetadata(
  raw: unknown
): z.infer<typeof partialChunkMetadataSchema> | undefined {
  const result = partialChunkMetadataSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

// ローカルソース取り込み状況確認
export const localSyncStatusQuerySchema = z.object({
  jobId: z.string().min(1, "jobIdは必須です"),
});
