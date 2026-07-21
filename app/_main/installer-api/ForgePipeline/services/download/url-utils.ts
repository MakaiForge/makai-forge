import path from "node:path";

export interface DownloadOptions {
  url: string;
  savePath: string;
  filename?: string;
  headers?: Record<string, string>;
}

export function extractFilename(
  url: string,
  originalUrl?: string
): string | undefined {
  if (originalUrl?.includes("#")) {
    const hashPart = originalUrl.split("#")[1];
    if (hashPart && !hashPart.startsWith("http") && hashPart.includes(".")) {
      return hashPart;
    }
  }

  if (url.includes("#")) {
    const hashPart = url.split("#")[1];
    if (hashPart && !hashPart.startsWith("http") && hashPart.includes(".")) {
      return hashPart;
    }
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const pathParts = pathname.split("/");
    const filename = pathParts.at(-1);

    if (filename?.includes(".") && filename.length > 0) {
      return decodeURIComponent(filename);
    }
  } catch {
    // Invalid URL
  }

  return undefined;
}

export function sanitizeFilename(filename: string): string {
  return filename.replaceAll(/[<>:"/\\|?*]/g, "_");
}

export function sanitizeRelativePath(pathValue: string): string {
  return pathValue
    .split(/[\\/]+/)
    .map((segment) => sanitizeFilename(segment))
    .filter(Boolean)
    .join(path.sep);
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

export function parseGofileUri(uri: string): {
  id: string;
  password: string | undefined;
} {
  let normalizedUri = uri.trim();

  if (
    !normalizedUri.startsWith("http://") &&
    !normalizedUri.startsWith("https://")
  ) {
    normalizedUri = `https://${normalizedUri}`;
  }

  try {
    const parsed = new URL(normalizedUri);
    const id = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const password = parsed.searchParams.get("password") || undefined;

    return {
      id,
      password,
    };
  } catch {
    const id =
      normalizedUri.split("?")[0].split("/").filter(Boolean).pop() || "";
    return {
      id,
      password: undefined,
    };
  }
}

export function logResolvedUrl(url: string): void {
  let sanitizedUrl = url;

  try {
    const parsedUrl = new URL(url);
    sanitizedUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    sanitizedUrl = url.replace(/[?#].*$/, "");
  }

  // Note: logger import moved to index.ts for centralized logging
  console.log(`[DownloadManager] Resolved URL: ${sanitizedUrl}`);
}

export function createDownloadPayload(
  directUrl: string,
  originalUrl: string,
  downloadId: string,
  savePath: string
) {
  const filename =
    extractFilename(originalUrl, directUrl) || extractFilename(directUrl);
  const sanitizedFilename = filename ? sanitizeFilename(filename) : undefined;

  return {
    action: "start" as const,
    game_id: downloadId,
    url: directUrl,
    save_path: savePath,
    out: sanitizedFilename,
    allow_multiple_connections: true,
  };
}
