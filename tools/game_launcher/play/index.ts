/**
 * tools/Mods_manager/play/index.ts
 *
 * Handlers IPC: modPlayGame e modKillGame.
 *
 * modPlayGame agora delega para o Python RPC (core/server.py)
 * via MakaiRPC, com streaming de eventos de progresso.
 * O Electron é apenas a interface — quem executa é o Python.
 */

import { registerEvent } from "@main/events/register-event";
import { MakaiRPC, type RpcEventCallback } from "@mods/services/makai-rpc";
import { killGameProcess } from "./steps/07-launch";
import type { SendProgress } from "./types";
import { logEvent, logError } from "./activity-logger";
import { logger } from "@main/services/logger";
import { gamesStore, storeKeys } from "@main/store";
import { gamesPlaytime } from "@main/services/process-watcher";

registerEvent("modPlayGame", async (event, gameId: string, profile?: string) => {
  const sender = event.sender;
  const send: SendProgress = (step, message, status, promptType) => {
    sender.send("mod-launch-progress", { step, message, status, promptType });
  };

  logEvent(gameId, "ipc_modPlayGame", { profile: profile || "Default" });

  // Lê config do jogo do LevelDB e passa pro Python
  const parts = gameId.split(":");
  const shop = parts[0] as any;
  const objectId = parts.slice(1).join(":");
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);
  const gameConfig: Record<string, unknown> = {
    game_id: gameId,
    profile: profile || "Default",
    shop,
    objectId,
  };
  if (game) {
    gameConfig.gamePath = (game as any).executablePath
      ? require("node:path").dirname((game as any).executablePath)
      : undefined;
    gameConfig.executablePath = (game as any).executablePath;
    gameConfig.protonPath = (game as any).protonPath || (game as any).protonVersion;
    gameConfig.winePrefixPath = (game as any).winePrefixPath || (game as any).prefix;
    gameConfig.steamAppId = (game as any).steamAppId;
    gameConfig.title = (game as any).title;
  }

  // Callback de eventos do Python RPC
  const eventCb: RpcEventCallback = (eventType, data) => {
    if (eventType === "progress") {
      send(data.step as string, data.message as string, "working");
    } else if (eventType === "error") {
      send(data.step as string, data.message as string, "error");
    } else if (eventType === "log") {
      logger.info(`[MakaiRPC:event] ${String(data.level)}: ${String(data.message)}`);
    } else if (eventType === "play_started") {
      logEvent(gameId, "play_started", { profile: String(data.profile || "") });
    } else if (eventType === "play_completed") {
      logEvent(gameId, "play_completed", {
        success: Boolean(data.success),
        method: String(data.method || ""),
        total_duration_ms: Number(data.total_duration_ms || 0),
      });
    }
  };

  MakaiRPC.onEvent(eventCb);

  try {
    logger.info(`[modPlayGame] Delegando para Python RPC: gameId=${gameId}`);
    const result = await MakaiRPC.call<Record<string, unknown>>("play_game", gameConfig);

    logEvent(gameId, "ipc_modPlayGame_result", {
      success: Boolean(result.success),
      method: String(result.method || ""),
    });

    // Registra o jogo como em execução para o Game Bar mostrar Stop
    if (result.success && game) {
      const now = performance.now();
      if (!gamesPlaytime.has(gameKey)) {
        gamesPlaytime.set(gameKey, {
          lastTick: now,
          firstTick: now,
          lastSyncTick: now,
        });
        const { WindowManager } = await import("@main/services/window-manager");
        WindowManager.mainWindow?.webContents.send(
          "on-games-running",
          Array.from(gamesPlaytime.entries()).map(([id, data]) => ({
            id,
            sessionDurationInMillis: performance.now() - data.firstTick,
          }))
        );
      }
    }

    return result;
  } catch (err) {
    const msg = String(err);
    logger.error(`[modPlayGame] RPC error: ${msg}`);
    logError(gameId, "ipc_modPlayGame", msg);
    send("error", `Erro no Play: ${msg}`, "error");
    return { success: false, error: msg, failedStep: "rpc" };
  } finally {
    MakaiRPC.removeEvent(eventCb);
  }
});

registerEvent("modKillGame", async () => {
  // Mata o processo do jogo — o Python também pode fazer isso
  try {
    await MakaiRPC.call("kill_game", {});
  } catch {
    // Fallback: mata via Node.js
  }
  return killGameProcess();
});

/**
 * Event Map — fluxo completo do Play via Python RPC:
 *
 * 1. IPC: modPlayGame(gameId, profile?)  ← index.ts
 * 2. Python RPC: play_game()
 *    2a. detect → proton → prefix → configs → frameworks → skse → deploy → launch
 *    2b. Cada etapa emite eventos via stdout
 *    2c. Electron escuta e atualiza a overlay
 * 3. Result: { success, method, pid, error, failedStep }
 * 4. Eventos de streaming: progress, error, log, play_completed
 *
 * ZERO operações de sistema no Node.js.
 */
