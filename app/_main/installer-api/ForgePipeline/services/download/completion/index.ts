import type { Download, Game, UserPreferences } from "@types";
import { Downloader } from "@shared";
import { db, downloadsStore, gamesStore, storeKeys } from "@main/store";
import { publishDownloadCompleteNotification } from "@main/services/notifications";
import { GameFilesManager } from "@provision/ForgePipeline/services/game-files-manager";
import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import path from "node:path";
import { updateDownloadStatus } from "./update-status";
import { handleExtraction } from "./extraction";
import { logger } from "@main/services/logger";

export { updateDownloadStatus } from "./update-status";
export { sendProgressUpdate } from "./ui-update";
export { handleExtraction };

export async function handleDownloadCompletion(
  download: Download,
  game: Game,
  gameId: string,
  shouldSeed: boolean,
  handleExtractionFn: (download: Download, game: Game) => Promise<void>,
  processNextFn: () => Promise<void>
): Promise<void> {
  publishDownloadCompleteNotification(game);

  let userPreferences: UserPreferences | undefined;
  try {
    userPreferences = await db.get<string, UserPreferences>(
      storeKeys.userPreferences,
      { valueEncoding: "json" }
    );
  } catch {
    // Preferences not set yet
  }

  logger.log(
    `[DownloadManager] Download completed: ${gameId}, shouldSeed: ${shouldSeed}`
  );

  const shouldSeedResult = await updateDownloadStatus(
    download,
    gameId,
    userPreferences?.seedAfterDownloadComplete
  );

  if (shouldSeed) {
    await downloadsStore.put(gameId, { ...download, shouldSeed: true });
  }

  if (download.folderName) {
    const installerPath = path.join(download.downloadPath, download.folderName);
    getDirectorySize(installerPath).then(async (installerSizeInBytes) => {
      const currentGame = await gamesStore.get(gameId);
      if (!currentGame) return;
      await gamesStore.put(gameId, { ...currentGame, installerSizeInBytes });
    });
  }

  if (download.automaticallyExtract) {
    const shouldPauseSeedingForExtraction =
      shouldSeedResult && download.downloader === Downloader.Torrent;
    if (shouldPauseSeedingForExtraction) {
      await handleExtractionFn(download, game);
    } else {
      await handleExtractionFn(download, game);
    }
  } else {
    const gameFilesManager = new GameFilesManager(game.shop, game.objectId);
    gameFilesManager.searchAndBindExecutable();
  }

  await processNextFn();
}
