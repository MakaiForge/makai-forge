import type { GameShop } from "@types";
import { gamesStore, storeKeys } from "@main/store";
import { launchGame } from "@main/helpers";
import { WindowManager } from "@main/services";
import { MakaiTime } from "@provision/ForgePipeline/services/makai-time";
import { sendProgress } from "./send-progress";
import { ensureProtonAvailable } from "./ensure-proton";
import {
  handleExistingPrefix,
  createPrefixWithDlls,
  showExecutableSelect,
} from "./handle-prefix";
import { downloadFromCatalog, promptManualInstaller } from "./download-installer";
import { resolveActualPrefix } from "@provision/ForgePipeline/orchestrator/prefix-setup";
import fs from "node:fs";
import path from "node:path";

export async function openGame(
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  executablePath: string,
  launchOptions?: string | null
): Promise<void> {
  if (shop === "steam") {
    await launchGame({ shop, objectId, executablePath, launchOptions });
    return;
  }

  WindowManager.createGameLauncherWindow(shop, objectId);
  await new Promise((r) => setTimeout(r, 1500));

  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);

  if (!game) {
    sendProgress("error", "Jogo não encontrado");
    return;
  }

  const needsRepair =
    !(executablePath && fs.existsSync(executablePath)) ||
    !(game.protonPath && fs.existsSync(path.join(game.protonPath, "proton"))) ||
    !(game.winePrefixPath && fs.existsSync(path.join(resolveActualPrefix(game.winePrefixPath), "drive_c")));

  if (!needsRepair) {
    sendProgress("complete", "Tudo ok. Iniciando...");
    await launchGame({ shop, objectId, executablePath, launchOptions });
    WindowManager.closeGameLauncherWindow();
    return;
  }

  sendProgress("checking", "Jogo corrompido. Iniciando reparo...");

  // 1. Garantir Proton
  const protonPathFinal = await ensureProtonAvailable(game, gameKey);
  if (!protonPathFinal) return;

  if (!game.winePrefixPath) {
    sendProgress("error", "Prefixo não configurado");
    return;
  }

  // 2. Lidar com prefixo
  const prefixHasDriveC = fs.existsSync(path.join(resolveActualPrefix(game.winePrefixPath), "drive_c"));

  if (prefixHasDriveC && game.executablePath && fs.existsSync(game.executablePath)) {
    sendProgress("complete", "Tudo ok. Iniciando...");
    await launchGame({ shop, objectId, executablePath: game.executablePath, launchOptions });
    WindowManager.closeGameLauncherWindow();
    return;
  }

  if (prefixHasDriveC) {
    await handleExistingPrefix(game.winePrefixPath, shop, objectId, game.title, gameKey);
    return;
  }

  const prefixCreated = await createPrefixWithDlls(objectId, protonPathFinal, game.winePrefixPath);
  if (!prefixCreated) return;

  // 3. Resolver fonte do instalador
  const hasCatalog = game.downloadSource === "catalog" && game.downloadUrl;

  let sourcePath: string | null = null;

  if (hasCatalog) {
    const result = await downloadFromCatalog(game, gameKey, shop, objectId);
    if (!result) return;
    sourcePath = result.sourcePath;
  } else {
    sourcePath = await promptManualInstaller();
    if (!sourcePath) return;
  }

  if (!fs.existsSync(sourcePath)) {
    sendProgress("error", "Instalador não encontrado");
    return;
  }

  // 4. Instalar via Python RPC (install_game)
  sendProgress("installing", "Instalando jogo...");
  const installResult = await MakaiTime.installGame(sourcePath, {
    winePrefixPath: game.winePrefixPath,
    protonPath: protonPathFinal,
    gameId: objectId,
    existingExePath: game.executablePath,
    onProgress: (step, percent, message) => {
      sendProgress(step, message);
      WindowManager.gameLauncherWindow?.webContents.send("preflight-progress", {
        status: step,
        detail: message,
        percent,
      });
    },
  });

  WindowManager.closeGameLauncherWindow();

  if (!installResult.success) {
    sendProgress("error", "Falha ao instalar jogo");
    return;
  }

  if (installResult.candidates.length > 0) {
    showExecutableSelect(
      installResult.candidates,
      installResult.suggested_dir,
      path.join(resolveActualPrefix(game.winePrefixPath), "drive_c"),
      game.title,
      gameKey,
      shop,
      objectId,
    );
  } else if (game.executablePath && fs.existsSync(game.executablePath)) {
    const gameData = await gamesStore.get(gameKey).catch(() => null);
    if (gameData) {
      await gamesStore.put(gameKey, { ...gameData, executablePath: game.executablePath });
    }
    sendProgress("complete", "Jogo restaurado com sucesso");
  } else {
    sendProgress("error", "Nenhum executável encontrado");
  }
}
