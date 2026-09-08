import type { WindowManager } from "../window-manager";
import { loadWindowURL } from "./load-url";

export function openMainWindow(wm: typeof WindowManager) {
  if (wm.mainWindow) {
    wm.mainWindow.show();
    if (wm.mainWindow.isMinimized()) wm.mainWindow.restore();
    wm.mainWindow.focus();
  } else {
    wm.createMainWindow();
  }
}

export function redirect(wm: typeof WindowManager, hash: string) {
  if (!wm.mainWindow) wm.createMainWindow();
  loadWindowURL(wm.mainWindow!, hash);
  if (wm.mainWindow?.isMinimized()) wm.mainWindow.restore();
  wm.mainWindow?.focus();
}
