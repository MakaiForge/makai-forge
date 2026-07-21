import type { DownloadProgress } from "@types";
import { downloadsStore } from "@main/store";
import { LibtorrentPayload, LibtorrentStatus } from "../types";
import { PythonRPC } from "@main/services/python-rpc";
import { calculateETA } from "../helpers";
import { logger } from "@main/services/logger";

export async function getDownloadStatusFromRpc(
  downloadingGameId: string
): Promise<DownloadProgress | null> {
  let response: { data: LibtorrentPayload | null };

  try {
    response = await PythonRPC.rpc.call<LibtorrentPayload | null>("status");
  } catch (error) {
    logger.error("[DownloadManager] RPC status poll failed", error);
    return null;
  }

  if (response.data === null || !downloadingGameId) return null;

  try {
    const {
      progress,
      numPeers,
      numSeeds,
      downloadSpeed,
      bytesDownloaded,
      fileSize,
      folderName,
      status,
    } = response.data;

    const isDownloadingMetadata =
      status === LibtorrentStatus.DownloadingMetadata;
    const isCheckingFiles = status === LibtorrentStatus.CheckingFiles;
    const download = await downloadsStore.get(downloadingGameId);

    if (!isDownloadingMetadata && !isCheckingFiles) {
      if (!download) return null;

      const effectiveFileSize =
        fileSize > 0
          ? fileSize
          : (download.selectedFilesSize ?? download.fileSize ?? 0);

      await downloadsStore.put(downloadingGameId, {
        ...download,
        bytesDownloaded,
        fileSize: effectiveFileSize,
        progress,
        folderName,
        status: "active",
      });
    }

    return {
      numPeers,
      numSeeds,
      downloadSpeed,
      timeRemaining: calculateETA(
        fileSize > 0
          ? fileSize
          : (download?.selectedFilesSize ?? download?.fileSize ?? 0),
        bytesDownloaded,
        downloadSpeed
      ),
      isDownloadingMetadata,
      isCheckingFiles,
      progress,
      gameId: downloadingGameId,
      download,
    } as DownloadProgress;
  } catch {
    return null;
  }
}
