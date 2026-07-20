import path from "node:path";
import type { GameShop, UserPreferences } from "@types";
import { Umu } from "@main/services";
import { db, gamesStore, storeKeys } from "@main/store";
import { registerEvent } from "@main/events/register-event";

const getGameLaunchProtonVersion = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<string | null> => {
  if (process.platform !== "linux") {
    return null;
  }

  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);
  const userPreferences = await db
    .get<string, UserPreferences | null>(storeKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const gameProtonPath = game?.protonPath;
  if (gameProtonPath && Umu.isValidProtonPath(gameProtonPath)) {
    return path.basename(gameProtonPath);
  }

  const defaultProtonPath = userPreferences?.defaultProtonPath;
  if (defaultProtonPath && Umu.isValidProtonPath(defaultProtonPath)) {
    return path.basename(defaultProtonPath);
  }

  return null;
};

registerEvent("getGameLaunchProtonVersion", getGameLaunchProtonVersion);
