import type { DownloadProgress, Game } from "@types";
import { WindowManager } from "@main/services/window-manager";

export function sendProgressUpdate(
  progress: number,
  status: DownloadProgress,
  game: Game
) {
  if (WindowManager.mainWindow) {
    WindowManager.mainWindow.setProgressBar(progress === 1 ? -1 : progress);
    WindowManager.mainWindow.webContents.send("on-download-progress", {
      ...status,
      game,
    });
  }
}
