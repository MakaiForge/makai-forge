import { registerEvent } from "@main/events/register-event";
import { GameShop } from "@types";
import path from "node:path";
import { DownloadManager, GameFilesManager, logger } from "@main/services";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import { Downloader, FILE_EXTENSIONS_TO_EXTRACT } from "@shared";

const extractGameDownload = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<boolean> => {
  const gameKey = storeKeys.game(shop, objectId);

  const [download, game] = await Promise.all([
    downloadsStore.get(gameKey),
    gamesStore.get(gameKey),
  ]);

  if (!download || !game) {
    const gameFilesManager = new GameFilesManager(shop, objectId);
    await gameFilesManager.failExtraction(
      new Error(
        "Could not start extraction because download metadata is missing"
      )
    );
    return false;
  }

  await downloadsStore.put(gameKey, {
    ...download,
    extracting: true,
  });

  const gameFilesManager = new GameFilesManager(shop, objectId);
  const targetFolderName = download.folderName;

  if (!targetFolderName) {
    await gameFilesManager.failExtraction(
      new Error("No downloaded archive was found to extract")
    );
    return false;
  }

  const runExtraction = () => {
    if (
      FILE_EXTENSIONS_TO_EXTRACT.some((ext) =>
        targetFolderName.toLowerCase().endsWith(ext)
      )
    ) {
      return gameFilesManager.extractDownloadedFile().catch((error) => {
        return gameFilesManager.failExtraction(error).catch(() => {
          // Fail state persistence is already logged in GameFilesManager
        });
      });
    }

    return gameFilesManager
      .extractFilesInDirectory(
        path.join(download.downloadPath, targetFolderName)
      )
      .then((success) => {
        if (success) {
          return gameFilesManager.setExtractionComplete(false).catch(() => {
            // Extraction completion failures are already logged downstream
          });
        }

        return undefined;
      })
      .catch((error) => {
        return gameFilesManager.failExtraction(error).catch(() => {
          // Fail state persistence is already logged in GameFilesManager
        });
      });
  };

  const shouldPauseSeedingForExtraction =
    download.downloader === Downloader.Torrent &&
    download.shouldSeed &&
    download.status === "seeding";

  if (shouldPauseSeedingForExtraction) {
    await DownloadManager.pauseSeeding(gameKey).catch((error) => {
      logger.error(
        "[extractGameDownload] Failed to pause seeding before extraction",
        error
      );
    });

    void runExtraction().finally(() => {
      DownloadManager.resumeSeeding(download).catch((error) => {
        logger.error(
          "[extractGameDownload] Failed to resume seeding after extraction",
          error
        );
      });
    });
  } else {
    void runExtraction();
  }

  return true;
};

registerEvent("extractGameDownload", extractGameDownload);
