import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf-8");

export const KNOWLEDGE_SYSTEM_PROMPT = read("knowledge-system.txt");
export const NO_CONTEXT_SYSTEM_PROMPT = read("no-context-system.txt");
export const CASUAL_SYSTEM_PROMPT = read("casual-system.txt");
export const CLEANSING_SYSTEM_PROMPT = read("cleansing-system.txt");
export const IMAGE_DESCRIPTION_PROMPT = read("image-description.txt");
export const AGENT_SYSTEM_PROMPT = read("agent-system.txt");

export function classifyIntentPrompt(userMessage: string): string {
  return read("classify-intent.txt").replace("{{userMessage}}", userMessage);
}
