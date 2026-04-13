import { ResultAsync, okAsync } from "neverthrow";

export function parseTxt(buf: Buffer): ResultAsync<string, Error> {
  return okAsync(buf.toString("utf-8"));
}
