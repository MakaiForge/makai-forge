import type { Download } from "@types";

export function getTorrentPayload(download: Download, downloadId: string) {
  const hasSelectedFileIndices =
    Array.isArray(download.fileIndices) && download.fileIndices.length > 0;

  return {
    action: "start" as const,
    game_id: downloadId,
    url: download.uri,
    save_path: download.downloadPath,
    file_indices: hasSelectedFileIndices ? download.fileIndices : undefined,
    metadata_timeout_ms: hasSelectedFileIndices ? 60_000 : undefined,
  };
}
