import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { toError } from "./errors";
import { isSupportedExtension, extensionToFileType } from "./parsers/index";
import type { LocalFileEntry } from "../packages/shared/src/types";

/**
 * basePath 配下に userInput が収まっているか検証する。
 * パストラバーサル防止。
 */
export function resolveSafePath(basePath: string, userInput: string): ResultAsync<string, Error> {
  const resolved = path.resolve(basePath, userInput);
  if (!resolved.startsWith(basePath)) {
    return errAsync(new Error("Invalid path: traversal detected"));
  }
  return okAsync(resolved);
}

/**
 * 指定ディレクトリを再帰的に走査し、対応ファイル一覧を返す。
 */
export function scanLocalFolder(basePath: string): ResultAsync<LocalFileEntry[], Error> {
  return ResultAsync.fromPromise(
    (async () => {
      const entries: LocalFileEntry[] = [];

      async function walk(dir: string): Promise<void> {
        const dirEntries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of dirEntries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!isSupportedExtension(ext)) continue;
            const fileType = extensionToFileType(ext);
            if (!fileType) continue;
            const stat = await fs.stat(fullPath);
            const relativePath = path.relative(basePath, fullPath);
            entries.push({
              relativePath,
              fileName: entry.name,
              fileType,
              sizeBytes: stat.size,
            });
          }
        }
      }

      await walk(basePath);
      return entries;
    })(),
    toError
  );
}

export function computeFileHash(filePath: string): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(
    fs.readFile(filePath).then((buf) =>
      crypto.createHash("sha256").update(buf).digest("hex")
    ),
    toError
  );
}
