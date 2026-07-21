import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { WindowManager, logger, Wine } from "@main/services";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import type { GameShop } from "@types";

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

const getPendingExecutableSelection = async () => {
  return WindowManager.getPendingExecutableSelectData();
};

const confirmExecutableSelection = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  executablePath: string
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);
  if (!game) return;

  const winePrefixPath =
    game.winePrefixPath ||
    Wine.getEffectivePrefixPath(game.winePrefixPath, objectId, game.title);

  const protonPath = game.protonPath || null;
  const protonVersion = protonPath ? path.basename(protonPath) : null;

  let enableEac = game.enableEac || false;
  let enableBattlEye = game.enableBattlEye || false;
  try {
    const ac = await ProtonRecommendationService.checkAntiCheat(objectId);
    if (ac.eac) enableEac = true;
    if (ac.battleye) enableBattlEye = true;
  } catch {
    // API unavailable, keep existing values
  }

  const updatedGame = {
    ...game,
    executablePath,
    winePrefixPath,
    protonPath,
    protonVersion,
    enableEac,
    enableBattlEye,
  };

  await gamesStore.put(gameKey, updatedGame);

  saveGameJson(objectId, updatedGame);

  logger.info(`[executableSelect] Saved: ${executablePath}`);

  // Notify the main window to refresh
  const mainWindow = WindowManager.mainWindow;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("on-game-executable-updated");
  }

  WindowManager.closeExecutableSelectWindow();
  WindowManager.openMainWindow();
};

const cancelExecutableSelection = async () => {
  WindowManager.closeExecutableSelectWindow();
  WindowManager.openMainWindow();
};

registerEvent("getPendingExecutableSelection", getPendingExecutableSelection);
registerEvent("confirmExecutableSelection", confirmExecutableSelection);
registerEvent("cancelExecutableSelection", cancelExecutableSelection);
