import { checkForRunnerUpdates } from "@emulators/updater";
import { WindowManager } from "./window-manager";
import { logger } from "./logger";

const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function performUpdateCheck() {
  try {
    const updates = await checkForRunnerUpdates();
    if (updates.length > 0) {
      logger.info(
        `[RunnerUpdater] ${updates.length} atualizações de emulador(es) disponíveis`
      );

      const win = WindowManager.mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send("on-runner-updates-available", updates);
      }
    }
  } catch (err) {
    logger.error("[RunnerUpdater] Erro ao verificar updates:", err);
  }
}

export function startRunnerUpdater() {
  if (intervalHandle) return;

  performUpdateCheck();

  intervalHandle = setInterval(performUpdateCheck, CHECK_INTERVAL);
}

export function stopRunnerUpdater() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
