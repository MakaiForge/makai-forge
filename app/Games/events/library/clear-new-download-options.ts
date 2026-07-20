import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { logger } from "@main/services";
import type { GameShop } from "@types";

const clearNewDownloadOptions = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const gameKey = storeKeys.game(shop, objectId);

  const game = await gamesStore.get(gameKey);
  if (!game) return;

  try {
    await gamesStore.put(gameKey, {
      ...game,
      newDownloadOptionsCount: undefined,
    });
    logger.info(`Cleared newDownloadOptionsCount for game ${gameKey}`);
  } catch (error) {
    logger.error(`Failed to clear newDownloadOptionsCount: ${error}`);
  }
};

registerEvent("clearNewDownloadOptions", clearNewDownloadOptions);
