import { registerEvent } from "@main/events/register-event";
import { storeKeys, gamesStore } from "@main/store";
import type { GameShop } from "@types";

const toggleAutomaticCloudSync = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  automaticCloudSync: boolean
) => {
  const gameKey = storeKeys.game(shop, objectId);

  const game = await gamesStore.get(gameKey);

  if (!game) return;

  await gamesStore.put(gameKey, {
    ...game,
    automaticCloudSync,
  });
};

registerEvent("toggleAutomaticCloudSync", toggleAutomaticCloudSync);
