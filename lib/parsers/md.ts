import { ResultAsync, okAsync } from "neverthrow";

export function parseMd(buf: Buffer): ResultAsync<string, Error> {
  const text = buf.toString("utf-8");
  // Obsidian wikilink [[target|label]] → label or target
  const cleaned = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) =>
    (label ?? target) as string
  );
  return okAsync(cleaned);
}
