import path from "node:path";
import fs from "node:fs";
import { app, dialog } from "electron";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { Wine, ProtonRecommendationService, WindowManager } from "@main/services";
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

registerEvent(
  "setGameExecutablePath",
  async (
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

    let enableEac = false;
    let enableBattlEye = false;

    try {
      const ac = await ProtonRecommendationService.checkAntiCheat(objectId);
      if (ac.eac) enableEac = true;
      if (ac.battleye) enableBattlEye = true;
    } catch {
      // API unavailable, leave disabled
    }

    const protonVersion = game.protonPath
      ? path.basename(game.protonPath)
      : null;

    const updatedGame = {
      ...game,
      executablePath,
      winePrefixPath,
      protonPath: game.protonPath || null,
      protonVersion,
      enableEac,
      enableBattlEye,
    };

    await gamesStore.put(gameKey, updatedGame);

    saveGameJson(objectId, updatedGame);

    const mainWindow = WindowManager.mainWindow;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("on-game-executable-updated");
    }
  }
);

registerEvent(
  "openExeFilePicker",
  async (
    _event: Electron.IpcMainInvokeEvent,
    defaultPath?: string | null
  ) => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar executável do jogo",
      defaultPath: defaultPath || undefined,
      filters: [{ name: "Executáveis", extensions: ["exe", "msi"] }],
      properties: ["openFile"],
    });

    return result.canceled ? null : result.filePaths[0];
  }
);
