import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { ResultAsync } from "neverthrow";
import { withRetry } from "./retry";
import { CLEANSING_SYSTEM_PROMPT } from "./prompts/prompts";
import { recordUsage } from "./usage-store";

export function cleanseWithGemini(rawText: string): ResultAsync<string, Error> {
  const start = performance.now();
  return withRetry(() =>
    generateText({
      model: google("gemini-2.5-flash"),
      system: CLEANSING_SYSTEM_PROMPT,
      prompt: rawText,
    })
  ).map((result) => {
    recordUsage({
      step: "cleanse_pdf",
      model: "gemini-2.5-flash",
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
      latencyMs: Math.round(performance.now() - start),
    });
    return result.text;
  });
}
