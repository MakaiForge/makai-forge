import type { DownloadProgress } from "@types";
import { downloadsStore } from "@main/store";
import { calculateETA } from "../helpers";
import type { JsHttpDownloader } from "../js-http-downloader";
import { logger } from "@main/services/logger";

export async function getDownloadStatusFromJs(
  downloadingGameId: string,
  jsDownloader: JsHttpDownloader | null,
  isPreparingDownload: boolean
): Promise<DownloadProgress | null> {
  if (!downloadingGameId) return null;

  if (isPreparingDownload) {
    try {
      const download = await downloadsStore.get(downloadingGameId);
      if (!download) return null;

      return {
        numPeers: 0,
        numSeeds: 0,
        downloadSpeed: 0,
        timeRemaining: -1,
        isDownloadingMetadata: true,
        isCheckingFiles: false,
        progress: 0,
        gameId: downloadingGameId,
        download,
      };
    } catch {
      return null;
    }
  }

  if (!jsDownloader) return null;

  const status = jsDownloader.getDownloadStatus();
  if (!status) return null;

  try {
    const download = await downloadsStore.get(downloadingGameId);
    if (!download) return null;

    const { progress, bytesDownloaded, fileSize, folderName } = status;
    const downloadSpeed = status.downloadSpeed;

    const effectiveFileSize = fileSize > 0 ? fileSize : download.fileSize;
    const updatedDownload = {
      ...download,
      bytesDownloaded,
      fileSize: effectiveFileSize,
      progress,
      folderName,
      status:
        status.status === "complete"
          ? ("complete" as const)
          : ("active" as const),
    };

    if (status.status === "active" || status.status === "complete") {
      await downloadsStore.put(downloadingGameId, updatedDownload);
    }

    return {
      numPeers: 0,
      numSeeds: 0,
      downloadSpeed,
      timeRemaining: calculateETA(
        effectiveFileSize ?? 0,
        bytesDownloaded,
        downloadSpeed
      ),
      isDownloadingMetadata: false,
      isCheckingFiles: false,
      progress,
      gameId: downloadingGameId,
      download: updatedDownload,
    };
  } catch (err) {
    logger.error("[DownloadManager] Error getting JS download status:", err);
    return null;
  }
}
