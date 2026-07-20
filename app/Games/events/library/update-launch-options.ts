import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { GameShop } from "@types";

const updateLaunchOptions = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  launchOptions: string | null
) => {
  const gameKey = storeKeys.game(shop, objectId);

  const game = await gamesStore.get(gameKey);

  if (game) {
    await gamesStore.put(gameKey, {
      ...game,
      launchOptions: launchOptions?.trim() != "" ? launchOptions : null,
    });
  }
};

registerEvent("updateLaunchOptions", updateLaunchOptions);
