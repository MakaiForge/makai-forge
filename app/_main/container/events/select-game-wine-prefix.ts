import { registerEvent } from "@main/events/register-event";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { storeKeys, gamesStore } from "@main/store";
import { Wine } from "@container/core/wine-prefix";
import type { GameShop } from "@types";
import { logOperation } from "../activity-logger";

const getGamesFolder = () => path.join(app.getPath("userData"), "games");

const saveGameJson = async (objectId: string, gameData: Record<string, unknown>) => {
  const folder = getGamesFolder();
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${objectId}.json`), JSON.stringify(gameData, null, 2), "utf-8");
};

const selectGameWinePrefix = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  winePrefixPath: string | null,
) => {
  logOperation("selectGameWinePrefix", "started", { shop, objectId, winePrefixPath });
  const _start = Date.now();
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);
  if (!game) {
    logOperation("selectGameWinePrefix", "error", { shop, objectId, error: "game not found", duration_ms: Date.now() - _start });
    return;
  }

  const updatedGame = { ...game, winePrefixPath: null };

  if (winePrefixPath) {
    const realPath = await fs.promises.realpath(winePrefixPath);
    if (!Wine.validatePrefix(realPath)) {
      logOperation("selectGameWinePrefix", "error", { shop, objectId, error: "invalid prefix path", duration_ms: Date.now() - _start });
      throw new Error("Invalid wine prefix path");
    }
    updatedGame.winePrefixPath = realPath;
  }

  await gamesStore.put(gameKey, updatedGame);
  await saveGameJson(objectId, updatedGame);
  logOperation("selectGameWinePrefix", "success", { shop, objectId, winePrefixPath: updatedGame.winePrefixPath, duration_ms: Date.now() - _start });
};

const getDefaultWinePrefixSelectionPath = async () => {
  try { return Wine.getDefaultPrefixPath(); }
  catch { return null; }
};

registerEvent("selectGameWinePrefix", selectGameWinePrefix);
registerEvent("getDefaultWinePrefixSelectionPath", getDefaultWinePrefixSelectionPath);
