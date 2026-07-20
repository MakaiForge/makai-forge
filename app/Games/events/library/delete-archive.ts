import path from "node:path";
import fs from "node:fs";

import { registerEvent } from "@main/events/register-event";
import { logger } from "@main/services/logger";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";

export const deleteArchiveFile = async (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`Deleted archive: ${filePath}`);
    }

    // Find the game that has this archive and clear installer size
    const normalizedPath = path.normalize(filePath);
    const downloads = await downloadsStore.values().all();

    for (const download of downloads) {
      if (!download.folderName) continue;

      const downloadPath = path.normalize(
        path.join(download.downloadPath, download.folderName)
      );

      if (downloadPath === normalizedPath) {
        const gameKey = storeKeys.game(download.shop, download.objectId);
        const game = await gamesStore.get(gameKey);

        if (game) {
          await gamesStore.put(gameKey, {
            ...game,
            installerSizeInBytes: null,
          });
        }
        break;
      }
    }

    return true;
  } catch (err) {
    logger.error(`Failed to delete archive: ${filePath}`, err);
    return false;
  }
};

const deleteArchive = async (
  _event: Electron.IpcMainInvokeEvent,
  filePath: string
) => deleteArchiveFile(filePath);

registerEvent("deleteArchive", deleteArchive);
