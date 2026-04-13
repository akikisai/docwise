import { ResultAsync } from "neverthrow";

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
};

export function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelayMs = 1000 }: RetryOptions = {}
): ResultAsync<T, Error> {
  const attempt = async (remaining: number): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      if (remaining === 0) throw error;
      const isRateLimit =
        error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED");
      if (!isRateLimit) throw error;
      const delay = baseDelayMs * Math.pow(2, maxRetries - remaining);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return attempt(remaining - 1);
    }
  };

  return ResultAsync.fromPromise(attempt(maxRetries), (e) =>
    e instanceof Error ? e : new Error(String(e))
  );
}
