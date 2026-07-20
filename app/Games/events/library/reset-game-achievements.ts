import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";

const resetGameAchievements = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const gameKey = storeKeys.game(shop, objectId);

  const game = await gamesStore.get(gameKey);
  if (!game) return;
};

registerEvent("resetGameAchievements", resetGameAchievements);
