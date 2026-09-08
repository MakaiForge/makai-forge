import { registerEvent } from "../register-event";
import type { Download, StartGameDownloadPayload } from "@types";
import { DownloadManager, logger } from "@main/services";
import { createGame } from "@main/services/library-sync";
import {
  appendTrackersToMagnet,
  getTrackers,
  normalizeDownloadUri,
} from "@main/services/torrent-trackers";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import {
  handleDownloadError,
  isKnownDownloadError,
  prepareGameEntry,
} from "@main/helpers";

const startGameDownload = async (
  _event: Electron.IpcMainInvokeEvent,
  payload: StartGameDownloadPayload
) => {
  const {
    objectId,
    title,
    shop,
    downloadPath,
    downloader,
    uri,
    automaticallyExtract,
    automaticallyDeleteArchiveFiles,
    fileIndices,
    selectedFilesSize,
  } = payload;

  const gameKey = storeKeys.game(shop, objectId);

  logger.log(
    `[Downloads] Start requested for ${gameKey} (downloader=${downloader}, queued=true)`
  );

  await DownloadManager.pauseDownload();

  for await (const [key, value] of downloadsStore.iterator()) {
    if (value.status === "active" && value.progress !== 1) {
      await downloadsStore.put(key, {
        ...value,
        status: "paused",
      });
    }
  }

  await prepareGameEntry({ gameKey, title, objectId, shop });

  await DownloadManager.cancelDownload(gameKey);

  // Adiciona trackers ao magnet link (URI sanitizada — remove \r\n, decodifica &amp;)
  const finalUri = appendTrackersToMagnet(normalizeDownloadUri(uri), getTrackers());

  const download: Download = {
    shop,
    objectId,
    status: "active",
    progress: 0,
    bytesDownloaded: 0,
    downloadPath,
    downloader,
    uri: finalUri,
    folderName: null,
    shouldSeed: false,
    timestamp: Date.now(),
    queued: true,
    extracting: false,
    automaticallyExtract,
    automaticallyDeleteArchiveFiles,
    fileIndices,
    selectedFilesSize,
    fileSize: selectedFilesSize ?? null,
  };

  try {
    await downloadsStore.put(gameKey, download);
    await DownloadManager.startDownload(download);

    const updatedGame = await gamesStore.get(gameKey);

    if (updatedGame) {
      console.log(`[DOWNLOAD] Saving downloadUrl for ${gameKey}:`, finalUri, `downloader:`, downloader);
      await gamesStore.put(gameKey, {
        ...updatedGame,
        downloadSource: "catalog",
        downloadUrl: finalUri,
        downloader,
      });
      await createGame(updatedGame).catch(() => {});
    } else {
      console.warn(`[DOWNLOAD] Game ${gameKey} not found in gamesStore, cannot save downloadUrl`);
    }

    return { ok: true };
  } catch (err: unknown) {
    if (isKnownDownloadError(err)) {
      logger.warn("Failed to start download with expected download error", err);
    } else {
      logger.error("Failed to start download", err);
    }
    return handleDownloadError(err, downloader);
  }
};

registerEvent("startGameDownload", startGameDownload);
