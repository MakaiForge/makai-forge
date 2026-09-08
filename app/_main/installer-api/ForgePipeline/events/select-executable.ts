import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { WindowManager, logger } from "@main/services";
import type { GameShop } from "@types";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const getGamesFolder = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "games");
};

const saveGameJson = (objectId: string, gameData: Record<string, unknown>) => {
  const folder = getGamesFolder();
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const filePath = path.join(folder, `${objectId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2), "utf-8");
};

const selectExecutable = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  executablePath: string
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);
  if (!game) return;

  const updatedGame = {
    ...game,
    executablePath,
    protonPath: game.protonPath || null,
    protonVersion: game.protonPath
      ? path.basename(game.protonPath)
      : game.protonVersion || null,
  };

  await gamesStore.put(gameKey, updatedGame);

  saveGameJson(objectId, updatedGame);

  logger.info(`[selectExecutable] Saved: ${executablePath}`);

  WindowManager.gameLauncherWindow?.webContents.send("preflight-progress", {
    status: "complete",
    detail: "Executável salvo. Pode fechar.",
  });

  // Notify the main window to refresh
  const mainWindow = WindowManager.mainWindow;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("on-game-executable-updated");
  }
};

registerEvent("selectExecutable", selectExecutable);
