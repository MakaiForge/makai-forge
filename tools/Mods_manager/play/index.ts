import { registerEvent } from "@main/events/register-event";
import { playGame } from "./play-game";
import { killGameProcess } from "./steps/07-launch";
import type { SendProgress } from "./types";
import { logEvent, logError } from "./activity-logger";

registerEvent("modPlayGame", async (event, gameId: string, profile?: string) => {
  const sender = event.sender;
  const send: SendProgress = (step, message, status, promptType) => {
    sender.send("mod-launch-progress", { step, message, status, promptType });
  };

  logEvent(gameId, "ipc_modPlayGame", { profile: profile || "Default" });

  try {
    const result = await playGame(gameId, send, profile);
    logEvent(gameId, "ipc_modPlayGame_result", { success: result.success, method: result.method });
    return result;
  } catch (err) {
    const msg = String(err);
    logError(gameId, "ipc_modPlayGame", msg);
    throw err;
  }
});

registerEvent("modKillGame", async () => {
  return killGameProcess();
});

/**
 * Event Map — fluxo completo do Play:
 *
 * 1. IPC: modPlayGame(gameId, profile?)  ← index.ts
 * 2. Step: detect                        ← steps/01-detect.ts
 *    2a. Busca Steam (appmanifest_*.acf)
 *    2b. Busca GOG (diretorios ~/GOG Games/, ~/GOG/, ~/Games/)
 *    2c. Fallback: caminho manual
 * 3. Step: proton                        ← steps/02-proton.ts
 *    3a. ProtonRecommendationService.recommend()
 *    3b. Verifica versão vs prefixo
 *    3c. Download se necessário
 * 4. Step: prefix                        ← steps/03-prefix.ts
 *    4a. Verifica prefixo Steam existente
 *    4b. Valida system.reg/drive_c/dosdevices
 *    4c. Cria via Python CLI ou fallback TS
 * 5. Step: configs                       ← steps/04-configs.ts
 *    5a. DLL overrides (user.reg)
 *    5b. winetricks deps
 *    5c. Registro Bethesda
 *    5d. dxvk.conf
 *    5e. My Games dir + INIs
 * 6. Step: skse                          ← steps/05-skse.ts
 *    6a. Verifica script extender
 *    6b. Download se necessário
 * 7. Step: deploy                        ← play-game.ts
 *    7a. Deploy mods via registry
 * 8. Step: launch                        ← steps/06-launch.ts
 *    8a. Monta env Steam/Proton
 *    8b. umu-run ou proton run
 *    8c. Spawn processo
 *
 * Result: { success, method: "skse"|"steam"|"direct", gamePath? }
 * Cada etapa registra: step + status + duration_ms em activity.log
 */
