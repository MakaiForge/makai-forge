import { sanitizeFilename, sanitizeRelativePath } from "./sanitize";
import { extractFilename } from "./extract";

export interface DownloadOptions {
  url: string;
  savePath: string;
  filename?: string;
  headers?: Record<string, string>;
}

export function resolveFilename(
  resumingFilename: string | undefined,
  originalUrl: string,
  downloadUrl: string
): string | undefined {
  if (resumingFilename) return resumingFilename;

  const extracted =
    extractFilename(originalUrl, downloadUrl) || extractFilename(downloadUrl);

  return extracted ? sanitizeFilename(extracted) : undefined;
}

export function buildDownloadOptions(
  url: string,
  savePath: string,
  filename: string | undefined,
  headers?: Record<string, string>
): DownloadOptions {
  return {
    url,
    savePath,
    filename,
    headers,
  };
}

export { sanitizeRelativePath };
