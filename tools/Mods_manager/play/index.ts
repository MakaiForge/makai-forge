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

registerEvent("modPlayGame", async (event, gameId: string, profile?: string) => {
  const sender = event.sender;
  const send: SendProgress = (step, message, status, promptType) => {
    sender.send("mod-launch-progress", { step, message, status, promptType });
  };

  logEvent(gameId, "ipc_modPlayGame", { profile: profile || "Default" });

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
    const result = await MakaiRPC.call<Record<string, unknown>>("play_game", {
      game_id: gameId,
      profile: profile || "Default",
    });

    logEvent(gameId, "ipc_modPlayGame_result", {
      success: Boolean(result.success),
      method: String(result.method || ""),
    });
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
