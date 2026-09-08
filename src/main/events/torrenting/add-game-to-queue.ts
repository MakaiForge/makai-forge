import { registerEvent } from "../register-event";
import type { Download, StartGameDownloadPayload } from "@types";
import { DownloadManager, logger } from "@main/services";
import { createGame } from "@main/services/library-sync";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import { parseBytes } from "@shared";
import { normalizeDownloadUri } from "@main/services/torrent-trackers";
import {
  handleDownloadError,
  isKnownDownloadError,
  prepareGameEntry,
} from "@main/helpers";

const addGameToQueue = async (
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
    fileSize,
    fileIndices,
    selectedFilesSize,
  } = payload;

  const parsedFileSize = parseBytes(fileSize ?? null);

  const gameKey = storeKeys.game(shop, objectId);

  const download: Download = {
    shop,
    objectId,
    status: "paused",
    progress: 0,
    bytesDownloaded: 0,
    downloadPath,
    downloader,
    // URI sanitizada — remove \r\n, decodifica entidades HTML (&amp; -> &)
    uri: normalizeDownloadUri(uri),
    folderName: null,
    fileSize: selectedFilesSize ?? parsedFileSize,
    shouldSeed: false,
    timestamp: Date.now(),
    queued: true,
    extracting: false,
    automaticallyExtract,
    automaticallyDeleteArchiveFiles,
    fileIndices,
    selectedFilesSize,
  };

  try {
    await DownloadManager.validateDownloadUrl(download);
  } catch (err: unknown) {
    if (isKnownDownloadError(err)) {
      logger.warn(
        "Failed to validate download URL for queue with expected download error",
        err
      );
    } else {
      logger.error("Failed to validate download URL for queue", err);
    }
    return handleDownloadError(err, downloader);
  }

  await prepareGameEntry({ gameKey, title, objectId, shop });

  try {
    await downloadsStore.put(gameKey, download);

    const updatedGame = await gamesStore.get(gameKey);

    if (updatedGame) {
      console.log(`[QUEUE] Saving downloadUrl for ${gameKey}:`, uri, `downloader:`, downloader);
      await gamesStore.put(gameKey, {
        ...updatedGame,
        downloadSource: "catalog",
        downloadUrl: uri,
        downloader,
      });
      await createGame(updatedGame).catch(() => {});
    } else {
      console.warn(`[QUEUE] Game ${gameKey} not found in gamesStore, cannot save downloadUrl`);
    }

    return { ok: true };
  } catch (err: unknown) {
    logger.error("Failed to add game to queue", err);

    if (err instanceof Error) {
      return { ok: false, error: err.message };
    }

    return { ok: false };
  }
};

registerEvent("addGameToQueue", addGameToQueue);
