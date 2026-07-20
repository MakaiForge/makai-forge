import { registerEvent } from "@main/events/register-event";
import { logger } from "@main/services/logger";
import { ModStorageService } from "@main/services";
import { WindowManager } from "@main/services/window-manager";
import { gamesStore, storeKeys } from "@main/store";
import { gamesPlaytime } from "@main/services/process-watcher";
import { playGame } from "./play-game";
import { killGameProcess } from "./steps/07-launch";
import { setupGame } from "./setup-game";
import type { SendProgress } from "./types";
import { logEvent, logError } from "./activity-logger";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

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
    ? path.dirname((game as any).executablePath) : "";
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

registerEvent("modPlayGame", async (event, gameId: string, profile?: string) => {
  const sender = event.sender;
  const parts = gameId.split(":");
  const shop = parts[0] as any;
  const objectId = parts.slice(1).join(":");
  const gameKey = storeKeys.game(shop, objectId);

  try {
    await WindowManager.createGameLauncherWindow(shop, objectId);
  } catch {
    logger.warn("[modPlayGame] Erro ao criar launcher window");
  }

  const stepToPreflight: Record<string, string> = {
    scan: "checking", proton: "checking", prefix: "installing",
    configs: "installing", frameworks: "installing", tools: "installing",
    skse: "installing", deploy: "installing", bridge: "installing", launch: "complete",
  };

  const sendToWindows: SendProgress = (step, message, status) => {
    sender.send("mod-launch-progress", { step, message, status });
    try {
      const preflightStatus = status === "error" ? "error"
        : status === "done" ? "complete" : stepToPreflight[step] || "checking";
      WindowManager.gameLauncherWindow?.webContents.send(
        "preflight-progress", { status: preflightStatus, detail: message, percent: null },
      );
    } catch { /* janela pode nao existir */ }
  };

  logEvent(gameId, "ipc_modPlayGame", { profile: profile || "Default" });

  try {
    let config = await ensureGameConfig(gameId);

    if (!config?.gamePath || !fs.existsSync(config.gamePath)) {
      const setupResult = await setupGame(gameId, shop, objectId, config, sendToWindows);
      if (!setupResult.success) return setupResult;
      config = ModStorageService.get<any>(`game:${gameId}:config`);
    }

    logger.info(`[modPlayGame] Iniciando play: gameId=${gameId}`);
    const result = await playGame(gameId, sendToWindows, profile);

    logEvent(gameId, "ipc_modPlayGame_result", {
      success: Boolean(result.success), method: String(result.method || ""),
    });

    if (result.success) {
      const now = performance.now();
      if (!gamesPlaytime.has(gameKey)) {
        gamesPlaytime.set(gameKey, { lastTick: now, firstTick: now, lastSyncTick: now });
        WindowManager.mainWindow?.webContents.send(
          "on-games-running",
          Array.from(gamesPlaytime.entries()).map(([id, data]) => ({
            id, sessionDurationInMillis: performance.now() - data.firstTick,
          })),
        );
      }
      setTimeout(() => { try { WindowManager.gameLauncherWindow?.close(); } catch {} }, 3000);
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

registerEvent("modKillGame", async () => killGameProcess());
