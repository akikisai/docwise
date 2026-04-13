import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { ResultAsync } from "neverthrow";
import { toError } from "./errors";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptTemplate = readFileSync(resolve(__dirname, "prompts/classify-query.txt"), "utf-8");

export type QueryComplexity = "simple" | "moderate" | "complex";

const queryComplexitySchema = z.object({
  complexity: z.enum(["simple", "moderate", "complex"]),
});

type ClassifyResult = {
  complexity: QueryComplexity;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
};

export function classifyQuery(userMessage: string): ResultAsync<ClassifyResult, Error> {
  const prompt = promptTemplate.replace("{{userMessage}}", userMessage);
  return ResultAsync.fromPromise(
    generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema: queryComplexitySchema }),
      prompt,
    }),
    toError,
  ).map((result) => ({
    complexity: result.output?.complexity ?? "moderate",
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    },
  }));
}
