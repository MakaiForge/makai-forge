import type { GameShop, Game } from "@types";
import { gamesStore, storeKeys } from "@main/store";
import { launchGame } from "@main/helpers";
import { WindowManager } from "@main/services";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { installGame } from "@game-launcher/install/install-game";
import { sendProgress } from "./send-progress";
import { ensureProtonAvailable } from "./ensure-proton";
import { showExecutableSelect } from "./handle-prefix";
import { resolveActualPrefix } from "@provision/ForgePipeline/orchestrator/prefix-setup";
import path from "node:path";
import fs from "node:fs";

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
    sendProgress("error", "Jogo não encontrado no banco de dados");
    return;
  }

  const actualPrefix = game.winePrefixPath
    ? resolveActualPrefix(game.winePrefixPath)
    : null;
  const driveC = actualPrefix ? path.join(actualPrefix, "drive_c") : null;
  const prefixReady = driveC && fs.existsSync(path.join(driveC, "windows", "system32"));
  const exeInsidePrefix =
    game.executablePath &&
    driveC &&
    game.executablePath.startsWith(driveC) &&
    fs.existsSync(game.executablePath);

  if (exeInsidePrefix && prefixReady) {
    sendProgress("complete", "Tudo ok. Iniciando...");
    await launchGame({ shop, objectId, executablePath: game.executablePath, launchOptions });
    WindowManager.closeGameLauncherWindow();
    return;
  }

  sendProgress("checking", "Verificando Proton...");
  const protonPathFinal = await ensureProtonAvailable(game, gameKey);
  if (!protonPathFinal) return;

  if (!prefixReady && game.winePrefixPath) {
    sendProgress("installing", "Criando prefixo Wine...");
    const prefixOk = await MakaiRPC.call<{ success: boolean }>("create_prefix", {
      game_id: objectId,
      proton_path: protonPathFinal,
      prefix_path: game.winePrefixPath,
      auto_dlls: true,
      game_path: "",
    });
    if (!prefixOk?.success) {
      sendProgress("error", "Falha ao criar prefixo Wine");
      return;
    }
  }

  const sourcePath = game.executablePath
    ? path.dirname(game.executablePath)
    : null;

  if (!sourcePath || !game.executablePath) {
    if (game.downloadSource === "catalog" && game.downloadUrl) {
      sendProgress("downloading", "Baixando jogo do catálogo...");
      WindowManager.closeGameLauncherWindow();
      return;
    }
    sendProgress("error", "Caminho do jogo não configurado");
    return;
  }

  // Se o diretório fonte não existe, o jogo já foi preparado pelo sistema antigo
  // — pula instalação e tenta lançar direto
  if (!fs.existsSync(sourcePath) && fs.existsSync(game.executablePath)) {
    sendProgress("complete", "Jogo pronto (instalação anterior)");
    await gamesStore.put(gameKey, { ...game, executablePath: game.executablePath });
    await launchGame({ shop, objectId, executablePath: game.executablePath, launchOptions });
    WindowManager.closeGameLauncherWindow();
    return;
  }

  sendProgress("installing", "Instalando/configurando jogo...");
  const installResult = await installGame(sourcePath, {
    prefixPath: game.winePrefixPath!,
    protonPath: protonPathFinal,
    gameId: objectId,
    existingExePath: game.executablePath,
    onProgress: (step, percent, message) => {
      sendProgress(step, message, percent);
    },
  });

  WindowManager.closeGameLauncherWindow();

  if (!installResult.success) {
    sendProgress("error", "Falha ao preparar jogo");
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
  } else if (game.executablePath) {
    await gamesStore.put(gameKey, { ...game, executablePath: game.executablePath });
    sendProgress("complete", "Jogo pronto");
    await launchGame({ shop, objectId, executablePath: game.executablePath, launchOptions });
  } else {
    sendProgress("error", "Nenhum executável encontrado");
  }
}
