import { registerEvent } from "../register-event";
import type { Download, StartGameDownloadPayload } from "@types";
import { DownloadManager, logger } from "@main/services";
import { createGame } from "@main/services/library-sync";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import {
  handleDownloadError,
  isKnownDownloadError,
  prepareGameEntry,
} from "@main/helpers";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const TRACKERS = (() => {
  try {
    const possiblePaths = [
      app.isPackaged
        ? path.join(process.resourcesPath, "app/_resources/binaries/torrent-tracker-list.txt")
        : null,
      path.join(app.getAppPath(), "app", "_resources", "binaries", "torrent-tracker-list.txt"),
    ].filter(Boolean) as string[];

    for (const file of possiblePaths) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, "utf-8");
          const trackers = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
          if (trackers.length > 0) return trackers;
        }
      } catch { /* try next path */ }
    }
    return [];
  } catch { return []; }
})();

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

  // Adiciona trackers ao magnet link
  const finalUri = uri.startsWith("magnet:") && TRACKERS.length > 0
    ? uri + TRACKERS.map(t => "&tr=" + encodeURIComponent(t)).join("")
    : uri;

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
