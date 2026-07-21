import { downloadsStore } from "@main/store";
import { orderBy } from "lodash-es";
import { Downloader } from "@shared";
import { storeKeys } from "@main/store";
import type { Download } from "@types";
import path from "node:path";
import fs from "node:fs";
import {
  SystemPath,
  DownloadManager,
  startMainLoop,
  Ludusavi,
  Lock,
  logger,
} from "@main/services";
import { getDirSize } from "@provision/ForgePipeline/services/download/helpers";
import { GofileApi } from "./services/hosters";
import "./events";
import { handleGetDownloadSources as _handleGetDownloadSources } from "./services/local-sources-handler";

const hasMissingSeedFiles = async (download: Download): Promise<boolean> => {
  if (!download.folderName) return false;

  const downloadTargetPath = path.join(
    download.downloadPath,
    download.folderName
  );

  if (!fs.existsSync(downloadTargetPath)) {
    return true;
  }

  const expectedSize = download.selectedFilesSize ?? download.fileSize ?? 0;

  if (expectedSize <= 0) {
    return false;
  }

  const currentSize = await getDirSize(downloadTargetPath);
  return currentSize < expectedSize;
};

export const loadState = async () => {
  await Lock.acquireLock();

  GofileApi.initialize();

  Ludusavi.copyConfigFileToUserData();
  Ludusavi.copyBinaryToUserData();

  // Auto-sync fontes locais
  const { downloadSourcesStore } = await import("@main/store");
  const localSources = _handleGetDownloadSources();
  for (const src of localSources) {
    await downloadSourcesStore.put(src.id, src as any).catch(() => {});
  }

  const downloads = await downloadsStore
    .values()
    .all()
    .then((games) => {
      return orderBy(games, "timestamp", "desc");
    });

  let interruptedDownload: Download | null = null;

  for (const download of downloads) {
    const downloadKey = storeKeys.game(download.shop, download.objectId);

    // Reset extracting state
    if (download.extracting) {
      await downloadsStore.put(downloadKey, {
        ...download,
        extracting: false,
      });
    }

    // Find interrupted active download (download that was running when app closed)
    // Mark it as paused but remember it for auto-resume
    if (download.status === "active" && !interruptedDownload) {
      interruptedDownload = download;
      await downloadsStore.put(downloadKey, {
        ...download,
        status: "paused",
      });
    } else if (download.status === "active") {
      // Mark other active downloads as paused
      await downloadsStore.put(downloadKey, {
        ...download,
        status: "paused",
      });
    }
  }

  // Re-fetch downloads after status updates
  const updatedDownloads = await downloadsStore
    .values()
    .all()
    .then((games) => orderBy(games, "timestamp", "desc"));

  const normalizedDownloads: Download[] = [];

  for (const download of updatedDownloads) {
    const downloadKey = storeKeys.game(download.shop, download.objectId);
    const hasInvalidQueuedState =
      download.queued &&
      (download.status === "removed" ||
        download.status === "complete" ||
        download.status === "seeding");

    if (!hasInvalidQueuedState) {
      normalizedDownloads.push(download);
      continue;
    }

    const normalizedDownload = {
      ...download,
      queued: false,
    };

    await downloadsStore.put(downloadKey, normalizedDownload);
    normalizedDownloads.push(normalizedDownload);
  }

  // Prioritize interrupted download, then queued downloads
  const downloadToResume =
    interruptedDownload ??
    normalizedDownloads.find(
      (game) =>
        game.queued && (game.status === "paused" || game.status === "error")
    );

  const downloadsToSeed: Download[] = [];

  for (const game of normalizedDownloads) {
    if (
      !game.shouldSeed ||
      game.downloader !== Downloader.Torrent ||
      game.progress !== 1 ||
      game.status !== "seeding" ||
      game.uri === null
    ) {
      continue;
    }

    if (!(await hasMissingSeedFiles(game))) {
      downloadsToSeed.push(game);
      continue;
    }

    const gameKey = storeKeys.game(game.shop, game.objectId);
    const expectedSize = game.selectedFilesSize ?? game.fileSize ?? 0;
    let progress = game.progress;

    if (game.folderName) {
      const downloadTargetPath = path.join(game.downloadPath, game.folderName);
      const currentSize = fs.existsSync(downloadTargetPath)
        ? await getDirSize(downloadTargetPath)
        : 0;
      progress =
        expectedSize > 0
          ? Math.min(currentSize / expectedSize, 1)
          : game.progress;
    }

    await downloadsStore.put(gameKey, {
      ...game,
      status: "paused",
      shouldSeed: false,
      queued: false,
      progress,
    });

    logger.warn(
      `[Startup] Seed files missing for ${gameKey}; seeding was disabled`
    );
  }

  // For torrents use Python RPC; HTTP downloads use JS downloader.
  const isTorrent = downloadToResume?.downloader === Downloader.Torrent;
  if (downloadToResume && !isTorrent) {
    // Start Python RPC for seeding only, then resume HTTP download with JS
    await DownloadManager.startRPC(undefined, downloadsToSeed);
    await DownloadManager.startDownload(downloadToResume).catch((err) => {
      // If resume fails, just log it - user can manually retry
      logger.error("Failed to auto-resume download:", err);
    });
  } else {
    // Use Python RPC for everything (torrent or fallback)
    await DownloadManager.startRPC(downloadToResume, downloadsToSeed);
  }

  startMainLoop();

  SystemPath.checkIfPathsAreAvailable();
};
