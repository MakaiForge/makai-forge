import { gamesStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";
import { registerEvent } from "@main/events/register-event";

const toggleGameMangohud = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  autoRunMangohud: boolean
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) return;

  await gamesStore.put(gameKey, {
    ...game,
    autoRunMangohud,
  });
};

registerEvent("toggleGameMangohud", toggleGameMangohud);
