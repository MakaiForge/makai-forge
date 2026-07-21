import { WindowManager, logger } from "@main/services";

export function sendProgress(status: string, detail: string | null = null, percent?: number) {
  WindowManager.gameLauncherWindow?.webContents.send("preflight-progress", { status, detail, percent });
  logger.info(`[progress] ${status}: ${detail}${percent != null ? ` (${percent}%)` : ""}`);
}
