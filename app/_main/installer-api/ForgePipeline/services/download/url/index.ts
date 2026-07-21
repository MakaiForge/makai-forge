export { extractFilename as extract } from "./extract";
export { sanitizeFilename, sanitizeRelativePath } from "./sanitize";
export { resolveFilename, buildDownloadOptions } from "./resolve";
export { parseGofileUri } from "./gofile";
export { createDownloadPayload } from "./payload";
export type { DownloadOptions } from "./resolve";

export function logResolvedUrl(url: string): void {
  let sanitizedUrl = url;

  try {
    const parsedUrl = new URL(url);
    sanitizedUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    sanitizedUrl = url.replace(/[?#].*$/, "");
  }

  console.log(`[DownloadManager] Resolved URL: ${sanitizedUrl}`);
}
