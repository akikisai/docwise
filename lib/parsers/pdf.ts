import { ResultAsync } from "neverthrow";
import pdfParse from "pdf-parse";
import { toError } from "../errors";

export function parsePdfFile(buf: Buffer): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(
    (async () => {
      const origWarn = console.warn;
      const origLog = console.log;
      const filter = (...args: unknown[]) =>
        typeof args[0] === "string" && args[0].includes("private use area");
      console.warn = (...a: unknown[]) => { if (!filter(...a)) origWarn.apply(console, a); };
      console.log = (...a: unknown[]) => { if (!filter(...a)) origLog.apply(console, a); };
      try {
        const result = await pdfParse(buf);
        return result.text;
      } finally {
        console.warn = origWarn;
        console.log = origLog;
      }
    })(),
    toError
  );
}
