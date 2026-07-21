import { registerEvent } from "@main/events/register-event";
import fs from "node:fs";
import { gamesStore, storeKeys } from "@main/store";
import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import { findGameRootFromExe } from "@main/events/helpers/find-game-root";
import { logger, WindowManager } from "@main/services";
import type { GameShop } from "@types";

const saveInstalledGameExecutable = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  executablePath: string,
  winePrefixPath: string,
  protonPath?: string | null
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) return { success: false };

  if (!fs.existsSync(executablePath)) {
    logger.warn(
      `[saveInstalledGameExecutable] Executable not found: ${executablePath}`
    );
    return { success: false };
  }

  await gamesStore.put(gameKey, {
    ...game,
    executablePath,
    winePrefixPath: winePrefixPath || game.winePrefixPath,
    protonPath: protonPath || game.protonPath,
    installedSizeInBytes: game.installedSizeInBytes,
  });

  findGameRootFromExe(executablePath)
    .then(async (gameRoot) => {
      if (gameRoot) {
        const installedSizeInBytes = await getDirectorySize(gameRoot);
        const currentGame = await gamesStore.get(gameKey);
        if (currentGame) {
          await gamesStore.put(gameKey, {
            ...currentGame,
            installedSizeInBytes,
          });
        }
      } else {
        logger.warn(
          `[saveInstalledGameExecutable] Could not determine game root for: ${executablePath}`
        );
      }
    })
    .catch((err) => {
      logger.error(
        `[saveInstalledGameExecutable] Failed to calculate game size: ${err}`
      );
    });

  WindowManager.mainWindow?.webContents.send("on-library-batch-complete");

  return { success: true };
};

registerEvent("saveInstalledGameExecutable", saveInstalledGameExecutable);
