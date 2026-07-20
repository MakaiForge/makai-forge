import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { logger } from "@main/services";
import type { GameShop } from "@types";

const assignGameToCollection = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  collectionIds: string[]
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) {
    throw new Error("game/not-found-local");
  }

  try {
    await gamesStore.put(gameKey, {
      ...game,
      collectionIds,
    });
  } catch (error) {
    logger.error("Failed to assign game to collection", error);
    throw new Error(`Failed to assign game to collection: ${error}`);
  }
};

registerEvent("assignGameToCollection", assignGameToCollection);
