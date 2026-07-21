import { sanitizeFilename } from "./sanitize";
import { extractFilename } from "./extract";

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
