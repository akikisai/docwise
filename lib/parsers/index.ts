import fs from "node:fs/promises";
import { ResultAsync } from "neverthrow";
import { toError } from "../errors";
import { parseMd } from "./md";
import { parseTxt } from "./txt";
import { parsePdfFile } from "./pdf";
import type { FileType } from "../../packages/shared/src/types";

const EXTENSION_TO_FILE_TYPE: Record<string, FileType> = {
  ".md": "md",
  ".txt": "txt",
  ".pdf": "pdf",
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_FILE_TYPE));

export function isSupportedExtension(ext: string): boolean {
  return SUPPORTED_EXTENSIONS.has(ext.toLowerCase());
}

export function extensionToFileType(ext: string): FileType | undefined {
  return EXTENSION_TO_FILE_TYPE[ext.toLowerCase()];
}

export function parseFile(filePath: string, fileType: FileType): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(fs.readFile(filePath), toError).andThen((buf) => {
    switch (fileType) {
      case "md":
        return parseMd(buf);
      case "txt":
        return parseTxt(buf);
      case "pdf":
        return parsePdfFile(buf);
      default:
        return ResultAsync.fromPromise(
          Promise.reject(new Error(`Unsupported file type: ${fileType}`)),
          toError
        );
    }
  });
}
