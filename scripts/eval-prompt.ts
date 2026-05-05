/**
 * プロンプト評価スクリプト
 *
 * Usage:
 *   pnpm eval:prompt                    -- 評価を実行しベースラインと比較
 *   pnpm eval:prompt:update-baseline    -- 現在のスコアをベースラインとして保存
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { KNOWLEDGE_SYSTEM_PROMPT, classifyIntentPrompt } from "../lib/prompts/prompts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATASETS_DIR = resolve(ROOT, "evals/datasets");
const BASELINE_PATH = resolve(ROOT, "evals/baseline.json");

// スコアがベースラインからこの値以上下がったら回帰とみなす
const REGRESSION_THRESHOLD = -0.1;

// prompts.ts からはテンプレート（置換前）が export されてないので直接読む
const classifyQueryPromptTemplate = readFileSync(
  resolve(ROOT, "lib/prompts/classify-query.txt"),
  "utf-8",
);

interface ClassifyCase {
  input: string;
  expected: string;
}

interface AnswerCase {
  input: string;
  context: string;
  expectedKeywords: string[];
}

function loadJsonl<T>(filename: string): T[] {
  const path = resolve(DATASETS_DIR, filename);
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

async function evalClassifyQuery(): Promise<number> {
  const cases = loadJsonl<ClassifyCase>("classify-query.jsonl");
  const schema = z.object({ complexity: z.enum(["simple", "moderate", "complex"]) });

  let correct = 0;
  for (const c of cases) {
    const prompt = classifyQueryPromptTemplate.replace("{{userMessage}}", c.input);
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema }),
      prompt,
    });
    const predicted = result.output?.complexity ?? "moderate";
    if (predicted === c.expected) correct++;
    else
      console.log(`  [classify-query] MISS: "${c.input}" → ${predicted} (expected: ${c.expected})`);
  }
  const score = correct / cases.length;
  console.log(`[classify-query] ${correct}/${cases.length} = ${(score * 100).toFixed(1)}%`);
  return score;
}

async function evalClassifyIntent(): Promise<number> {
  const cases = loadJsonl<ClassifyCase>("classify-intent.jsonl");
  const schema = z.object({ intent: z.enum(["casual", "knowledge"]) });

  let correct = 0;
  for (const c of cases) {
    const prompt = classifyIntentPrompt(c.input);
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema }),
      prompt,
    });
    const predicted = result.output?.intent ?? "casual";
    if (predicted === c.expected) correct++;
    else
      console.log(
        `  [classify-intent] MISS: "${c.input}" → ${predicted} (expected: ${c.expected})`,
      );
  }
  const score = correct / cases.length;
  console.log(`[classify-intent] ${correct}/${cases.length} = ${(score * 100).toFixed(1)}%`);
  return score;
}

async function evalDocwiseAnswer(): Promise<number> {
  const cases = loadJsonl<AnswerCase>("docwise-answer.jsonl");

  let totalScore = 0;
  for (const c of cases) {
    const userContent = `コンテキスト:\n${c.context}\n\n質問: ${c.input}`;
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system: KNOWLEDGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    const answer = result.text;
    const matched = c.expectedKeywords.filter((kw) => answer.includes(kw));
    const caseScore = matched.length / c.expectedKeywords.length;
    totalScore += caseScore;
    if (caseScore < 1.0) {
      const missed = c.expectedKeywords.filter((kw) => !answer.includes(kw));
      console.log(`  [docwise-answer] PARTIAL: "${c.input}" — missed: ${missed.join(", ")}`);
    }
  }
  const score = totalScore / cases.length;
  console.log(`[docwise-answer] avg keyword coverage = ${(score * 100).toFixed(1)}%`);
  return score;
}

type Baseline = Record<string, number>;

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
}

function saveBaseline(scores: Baseline): void {
  writeFileSync(BASELINE_PATH, JSON.stringify(scores, null, 2) + "\n", "utf-8");
  console.log(`\n[baseline] Saved to ${BASELINE_PATH}`);
}

async function main(): Promise<void> {
  const updateBaseline = process.argv.includes("--update-baseline");

  console.log("=== Prompt Evaluation ===\n");

  const scores: Baseline = {
    "classify-query": await evalClassifyQuery(),
    "classify-intent": await evalClassifyIntent(),
    "docwise-answer": await evalDocwiseAnswer(),
  };

  if (updateBaseline) {
    saveBaseline(scores);
    return;
  }

  // ベースラインと比較し、回帰があればexit 1
  const baseline = loadBaseline();
  let hasRegression = false;

  console.log("\n--- Baseline Comparison ---");
  for (const [name, score] of Object.entries(scores)) {
    const prev = baseline[name];
    if (prev === undefined) {
      console.log(`  ${name}: ${(score * 100).toFixed(1)}% (no baseline)`);
      continue;
    }
    const diff = score - prev;
    const diffStr = diff >= 0 ? `+${(diff * 100).toFixed(1)}%` : `${(diff * 100).toFixed(1)}%`;
    const status = diff < REGRESSION_THRESHOLD ? "REGRESSION" : "OK";
    console.log(
      `  ${name}: ${(score * 100).toFixed(1)}% (baseline: ${(prev * 100).toFixed(1)}%, diff: ${diffStr}) [${status}]`,
    );
    if (diff < REGRESSION_THRESHOLD) hasRegression = true;
  }

  if (hasRegression) {
    console.error("\n[FAIL] Regression detected (threshold: -10%)");
    process.exit(1);
  }

  console.log("\n[PASS] No regression detected.");
}

main().catch((err: unknown) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
