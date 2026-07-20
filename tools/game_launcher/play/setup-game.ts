import { dialog } from "electron";
import { logger } from "@main/services/logger";
import { ModStorageService } from "@main/services";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { WindowManager } from "@main/services/window-manager";
import { gamesStore, storeKeys } from "@main/store";
import { createPrefix } from "@prefix/core/init";
import { installGame } from "@game-launcher/install/install-game";
import { waitForFolderSelection } from "@provision/ForgePipeline/events/folder-select-window";
import type { SendProgress } from "./types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function gameSlug(gameId: string): string {
  return gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
}

async function autoDetectProton(): Promise<string | null> {
  const dirs = [
    path.join(os.homedir(), ".config", "makai-forger", "compat-tools", "compatibilitytools.d"),
    path.join(os.homedir(), ".steam", "steam", "compatibilitytools.d"),
    path.join(os.homedir(), ".local", "share", "Steam", "steamapps", "common"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (fs.existsSync(path.join(dir, entry.name, "proton")))
        return path.join(dir, entry.name);
    }
  }
  return null;
}

async function pickExecutable(
  candidates: Array<{ path: string; name: string; size: number }>,
  prefixPath: string,
): Promise<string | null> {
  const driveC = path.resolve(prefixPath, "drive_c");

  if (candidates.length > 0) {
    const result = await dialog.showOpenDialog({
      title: "Selecione o executável do jogo",
      defaultPath: candidates[0].path,
      filters: [{ name: "Executáveis", extensions: ["exe"] }],
      properties: ["openFile"],
    });
    if (!result.canceled && result.filePaths?.[0]) return result.filePaths[0];
  }

  const manual = await dialog.showOpenDialog({
    title: "Procurar executável do jogo",
    defaultPath: driveC,
    filters: [{ name: "Executáveis", extensions: ["exe", "msi"] }],
    properties: ["openFile"],
  });
  return manual.canceled ? null : manual.filePaths[0];
}

export interface SetupResult {
  success: boolean;
  error?: string;
  failedStep?: string;
}

export async function setupGame(
  gameId: string,
  shop: string,
  objectId: string,
  config: any,
  sendToWindows: SendProgress,
): Promise<SetupResult> {
  const gameKey = storeKeys.game(shop as any, objectId);

  sendToWindows("scan", "Selecione a pasta ou executável do jogo...", "working");
  const fileResult = await dialog.showOpenDialog({
    title: "Selecione a pasta ou executável do jogo",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Jogo/Instalador", extensions: ["exe", "msi"] }],
  });
  if (fileResult.canceled || !fileResult.filePaths?.[0]) {
    sendToWindows("scan", "Nada selecionado", "error");
    return { success: false, error: "Nada selecionado", failedStep: "config" };
  }
  const selectedPath = fileResult.filePaths[0];

  let protonPath = config?.protonVersion || "";
  if (!protonPath) {
    sendToWindows("proton", "Procurando Proton...", "working");
    const detected = await autoDetectProton();
    if (detected) {
      protonPath = detected;
      logger.info(`[setupGame] Proton auto-detectado: ${protonPath}`);
    } else {
      sendToWindows("proton", "Nenhum Proton encontrado", "error");
      return { success: false, error: "Nenhum Proton encontrado no sistema", failedStep: "proton" };
    }
  }

  const prefixPath = config?.protonPrefix
    || path.join(os.homedir(), "Games", "Makai-forger", gameSlug(gameId));

  sendToWindows("prefix", "Criando prefixo Wine...", "working");
  const prefixResult = await createPrefix({
    protonPath,
    prefixPath,
    steamClientPath: protonPath,
    gameId,
    timeout: 120000,
    onProgress: (msg) => sendToWindows("prefix", msg, "working"),
  });
  if (!prefixResult.success) {
    sendToWindows("prefix", `Falha ao criar prefixo: ${prefixResult.error}`, "error");
    return { success: false, error: prefixResult.error || "Falha ao criar prefixo", failedStep: "prefix" };
  }

  sendToWindows("prefix", "Analisando instalador...", "working");
  const detection = await MakaiRPC.call<any>("detect_installer_type", {
    source_path: selectedPath,
  });

  let exePath: string | null = "";

  if (detection.is_installer) {
    sendToWindows("prefix", "Instalando jogo no prefixo...", "working");
    const installResult = await installGame(selectedPath, {
      prefixPath,
      protonPath,
      gameId,
      onProgress: (_step, _pct, msg) => sendToWindows("prefix", msg, "working"),
    });

    if (!installResult.success) {
      sendToWindows("prefix", `Falha ao instalar: ${installResult.error}`, "error");
      return { success: false, error: installResult.error || "Falha ao instalar", failedStep: "install" };
    }

    exePath = await pickExecutable(installResult.candidates, prefixPath);
  } else {
    sendToWindows("prefix", "Selecione os itens para copiar...", "working");

    const dirItems = fs.readdirSync(selectedPath, { withFileTypes: true });
    const items = dirItems.map((e) => {
      const full = path.join(selectedPath, e.name);
      let size = 0;
      if (e.isFile()) try { size = fs.statSync(full).size; } catch { /* ignore */ }
      return { name: e.name, path: full, isDirectory: e.isDirectory(), size };
    });

    WindowManager.createFolderSelectWindow({
      folderPath: selectedPath, items, prefixPath,
      protonPath, gameId, shop, objectId,
    });
    WindowManager.showFolderSelectWindow();

    const folderResult = await waitForFolderSelection();

    if (folderResult.canceled) {
      sendToWindows("scan", "Seleção cancelada", "error");
      return { success: false, error: "Seleção cancelada", failedStep: "config" };
    }

    exePath = await pickExecutable(folderResult.candidates, prefixPath);
  }

  if (!exePath) {
    sendToWindows("scan", "Nenhum executável selecionado", "error");
    return { success: false, error: "Nenhum executável selecionado", failedStep: "config" };
  }

  const newConfig = {
    gamePath: path.dirname(exePath),
    protonVersion: protonPath,
    protonPrefix: prefixPath,
    stagingDir: path.join(os.homedir(), "Games", "Mods", gameId, "staging"),
  };
  ModStorageService.put(`game:${gameId}:config`, newConfig);

  const game = await gamesStore.get(gameKey).catch(() => null);
  if (game) {
    await gamesStore.put(gameKey, {
      ...game,
      executablePath: exePath,
      winePrefixPath: prefixPath,
      protonPath,
    });
  }

  logger.info(`[setupGame] Jogo configurado: exe=${exePath}, prefix=${prefixPath}`);
  sendToWindows("prefix", "Jogo configurado. Iniciando...", "done");

  return { success: true };
}
