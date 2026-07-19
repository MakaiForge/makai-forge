import { dialog } from "electron";
import { registerEvent } from "@main/events/register-event";
import { logger } from "@main/services/logger";
import { ModStorageService } from "@main/services";
import { WindowManager } from "@main/services/window-manager";
import { gamesStore, storeKeys } from "@main/store";
import { gamesPlaytime } from "@main/services/process-watcher";
import { createPrefix } from "@prefix/core/init";
import { installGame } from "@game-launcher/install/install-game";
import { playGame } from "./play-game";
import { killGameProcess } from "./steps/07-launch";
import type { SendProgress } from "./types";
import { logEvent, logError } from "./activity-logger";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

async function ensureGameConfig(gameId: string) {
  const existing = ModStorageService.get<any>(`game:${gameId}:config`);
  if (existing?.gamePath || existing?.protonVersion) return existing;

  const parts = gameId.split(":");
  const shop = parts[0] as any;
  const objectId = parts.slice(1).join(":");
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);
  if (!game) return existing;

  const gamePath = (game as any).executablePath
    ? path.dirname((game as any).executablePath)
    : "";
  const protonPath = (game as any).protonPath || (game as any).protonVersion || "";
  const prefixPath = (game as any).winePrefixPath || (game as any).prefix || "";

  if (!gamePath && !protonPath && !prefixPath) return existing;

  const config = {
    gamePath,
    protonVersion: protonPath,
    protonPrefix: prefixPath,
    stagingDir: existing?.stagingDir || path.join(os.homedir(), "Games", "Mods", gameId, "staging"),
  };

  ModStorageService.put(`game:${gameId}:config`, config);
  logger.info(`[modPlayGame] Config migrada do gamesStore para game:${gameId}:config`);
  return config;
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
      const protonBin = path.join(dir, entry.name, "proton");
      if (fs.existsSync(protonBin)) return path.dirname(protonBin);
    }
  }
  return null;
}

registerEvent("modPlayGame", async (event, gameId: string, profile?: string) => {
  const sender = event.sender;

  const parts = gameId.split(":");
  const shop = parts[0] as any;
  const objectId = parts.slice(1).join(":");
  const gameKey = storeKeys.game(shop, objectId);

  // Abre janela do game launcher
  try {
    await WindowManager.createGameLauncherWindow(shop, objectId);
  } catch (err) {
    logger.warn(`[modPlayGame] Erro ao criar launcher window: ${err}`);
  }

  const stepToPreflight: Record<string, string> = {
    scan: "checking", proton: "checking",
    prefix: "installing", configs: "installing",
    frameworks: "installing", tools: "installing",
    skse: "installing", deploy: "installing",
    bridge: "installing", launch: "complete",
  };

  const sendToWindows: SendProgress = (step, message, status, promptType) => {
    sender.send("mod-launch-progress", { step, message, status, promptType });
    try {
      const preflightStatus = status === "error" ? "error"
        : status === "done" ? "complete"
        : stepToPreflight[step] || "checking";
      WindowManager.gameLauncherWindow?.webContents.send(
        "preflight-progress",
        { status: preflightStatus, detail: message, percent: null }
      );
    } catch { /* janela pode nao existir */ }
  };

  logEvent(gameId, "ipc_modPlayGame", { profile: profile || "Default" });

  try {
    let config = await ensureGameConfig(gameId);

    // Se não tem gamePath, configura do zero: selecionar pasta + criar prefixo + copiar jogo
    if (!config?.gamePath) {
      sendToWindows("scan", "Selecione a pasta do jogo...", "working");
      const folderResult = await dialog.showOpenDialog({
        title: "Selecione a pasta do jogo",
        properties: ["openDirectory"],
      });
      if (folderResult.canceled || !folderResult.filePaths?.[0]) {
        sendToWindows("scan", "Nenhuma pasta selecionada", "error");
        return { success: false, error: "Pasta do jogo não selecionada", failedStep: "config" };
      }
      const selectedPath = folderResult.filePaths[0];

      // Auto-detectar Proton se não tiver
      let protonPath = config?.protonVersion || "";
      if (!protonPath) {
        sendToWindows("proton", "Procurando Proton...", "working");
        const detected = await autoDetectProton();
        if (detected) {
          protonPath = detected;
          logger.info(`[modPlayGame] Proton auto-detectado: ${protonPath}`);
        } else {
          sendToWindows("proton", "Nenhum Proton encontrado", "error");
          return { success: false, error: "Nenhum Proton encontrado no sistema", failedStep: "proton" };
        }
      }

      // Definir prefixo
      const prefixPath = path.join(os.homedir(), "Games", "Prefix", gameId);

      // Criar prefixo
      sendToWindows("prefix", "Criando prefixo Wine...", "working");
      const prefixResult = await createPrefix({
        protonPath,
        prefixPath,
        gameId,
        timeout: 120000,
        onProgress: (msg) => sendToWindows("prefix", msg, "working"),
      });
      if (!prefixResult.success) {
        sendToWindows("prefix", `Falha ao criar prefixo: ${prefixResult.error}`, "error");
        return { success: false, error: prefixResult.error || "Falha ao criar prefixo", failedStep: "prefix" };
      }

      // Copiar jogo para o prefixo (drive_c/)
      sendToWindows("prefix", "Copiando jogo para o prefixo...", "working");
      const installResult = await installGame(selectedPath, {
        prefixPath,
        protonPath,
        gameId,
        onProgress: (step, _pct, msg) => {
          sendToWindows("prefix", msg, "working");
        },
      });

      if (!installResult.success) {
        sendToWindows("prefix", `Falha ao copiar jogo: ${installResult.error}`, "error");
        return { success: false, error: installResult.error || "Falha ao copiar jogo", failedStep: "install" };
      }

      // Se encontrou executáveis, usar o primeiro
      let exePath = "";
      if (installResult.candidates.length > 0) {
        exePath = installResult.candidates[0].path;
      }

      // Salvar config
      config = {
        gamePath: exePath ? path.dirname(exePath) : "",
        protonVersion: protonPath,
        protonPrefix: prefixPath,
        stagingDir: path.join(os.homedir(), "Games", "Mods", gameId, "staging"),
      };
      ModStorageService.put(`game:${gameId}:config`, config);

      // Salvar no gamesStore tambem
      const game = await gamesStore.get(gameKey).catch(() => null);
      if (game) {
        await gamesStore.put(gameKey, {
          ...game,
          executablePath: exePath,
          winePrefixPath: prefixPath,
          protonPath,
        });
      }

      logger.info(`[modPlayGame] Jogo configurado: exe=${exePath}, prefix=${prefixPath}`);
      sendToWindows("prefix", "Jogo copiado e configurado. Iniciando...", "done");
    }

    logger.info(`[modPlayGame] Iniciando play via TypeScript: gameId=${gameId}`);
    const result = await playGame(gameId, sendToWindows, profile);

    logEvent(gameId, "ipc_modPlayGame_result", {
      success: Boolean(result.success),
      method: String(result.method || ""),
    });

    if (result.success) {
      const now = performance.now();
      if (!gamesPlaytime.has(gameKey)) {
        gamesPlaytime.set(gameKey, {
          lastTick: now,
          firstTick: now,
          lastSyncTick: now,
        });
        WindowManager.mainWindow?.webContents.send(
          "on-games-running",
          Array.from(gamesPlaytime.entries()).map(([id, data]) => ({
            id,
            sessionDurationInMillis: performance.now() - data.firstTick,
          }))
        );
      }

      // Fecha janela do game launcher apos 3s
      setTimeout(() => {
        try { WindowManager.gameLauncherWindow?.close(); } catch {}
      }, 3000);
    }

    return result;
  } catch (err) {
    const msg = String(err);
    logger.error(`[modPlayGame] Error: ${msg}`);
    logError(gameId, "ipc_modPlayGame", msg);
    sendToWindows("error", `Erro no Play: ${msg}`, "error");
    return { success: false, error: msg, failedStep: "ts" };
  }
});

registerEvent("modKillGame", async () => {
  return killGameProcess();
});
