import { gamesStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";
import { registerEvent } from "@main/events/register-event";

const toggleGameGamemode = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  autoRunGamemode: boolean
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) return;

  await gamesStore.put(gameKey, {
    ...game,
    autoRunGamemode,
  });
};

registerEvent("toggleGameGamemode", toggleGameGamemode);
