import { registerEvent } from "@main/events/register-event";
import { gamesStore, downloadsStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";

const getGameByObjectId = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const gameKey = storeKeys.game(shop, objectId);
  let game: any;
  let download: any;
  try {
    [game, download] = await Promise.all([
      gamesStore.get(gameKey),
      downloadsStore.get(gameKey),
    ]);
  } catch {
    return null;
  }

  if (!game || game.isDeleted) return null;

  return { ...game, id: gameKey, download };
};

registerEvent("getGameByObjectId", getGameByObjectId);
