import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { env } from "./env";

const langfuseEnabled = env.LANGFUSE_PUBLIC_KEY !== "" && env.LANGFUSE_SECRET_KEY !== "";

let spanProcessor: LangfuseSpanProcessor | undefined;

if (langfuseEnabled) {
  spanProcessor = new LangfuseSpanProcessor();
  const sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();
  console.info("[langfuse] OpenTelemetry 初期化完了");
}

export { spanProcessor };

export const telemetryConfig = langfuseEnabled ? { isEnabled: true as const } : undefined;
