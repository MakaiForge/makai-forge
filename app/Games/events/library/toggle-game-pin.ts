import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { logger } from "@main/services";
import type { GameShop } from "@types";

const toggleGamePin = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  pin: boolean
) => {
  try {
    const gameKey = storeKeys.game(shop, objectId);

    const game = await gamesStore.get(gameKey);
    if (!game) return;

    await gamesStore.put(gameKey, {
      ...game,
      isPinned: pin,
      pinnedDate: pin ? new Date() : null,
    });
  } catch (error) {
    logger.error("Failed to update game pinned status", error);
    throw new Error(`Failed to update game pinned status: ${error}`);
  }
};

registerEvent("toggleGamePin", toggleGamePin);
