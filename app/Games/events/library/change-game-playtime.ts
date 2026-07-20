import { registerEvent } from "@main/events/register-event";
import { GameShop } from "@types";
import { gamesStore, storeKeys } from "@main/store";

const changeGamePlaytime = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  playTimeInSeconds: number
) => {
  try {
    const gameKey = storeKeys.game(shop, objectId);
    const game = await gamesStore.get(gameKey);
    if (!game) return;

    await gamesStore.put(gameKey, {
      ...game,
      playTimeInMilliseconds: playTimeInSeconds * 1000,
      hasManuallyUpdatedPlaytime: true,
    });
  } catch (error) {
    throw new Error(`Failed to update game playtime: ${error}`);
  }
};

registerEvent("changeGamePlayTime", changeGamePlaytime);
