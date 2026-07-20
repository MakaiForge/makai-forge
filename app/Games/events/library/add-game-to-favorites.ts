import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";

const addGameToFavorites = async (
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
      favorite: true,
    });
  } catch (error) {
    throw new Error(`Failed to update game favorite status: ${error}`);
  }
};

registerEvent("addGameToFavorites", addGameToFavorites);
