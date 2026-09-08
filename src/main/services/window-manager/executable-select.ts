import icon from "@assets/assets/icons/app/icon.png?asset";
import { BrowserWindow, app, screen } from "electron";
import { isStaging } from "@main/constants";
import type { WindowManager } from "../window-manager";
import type { ExecutableSelectData } from "./types";
import { loadWindowURL } from "./load-url";

const WINDOW_WIDTH = 600;
const WINDOW_HEIGHT = 500;

export function createExecutableSelectWindow(
  wm: typeof WindowManager,
  data: ExecutableSelectData
) {
  if (wm.executableSelectWindow) {
    wm.executableSelectWindow.close();
    wm.executableSelectWindow = null;
  }

  wm.pendingExecutableSelectData = data;

  const display = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = display.bounds;

  const x = Math.round((displayWidth - WINDOW_WIDTH) / 2);
  const y = Math.round((displayHeight - WINDOW_HEIGHT) / 2);

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: "#1c1c1c",
    icon,
    skipTaskbar: false,
    webPreferences: {
      preload: require("node:path").join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
    show: false,
  });

  win.removeMenu();
  loadWindowURL(win, "executable-select");

  win.on("closed", () => {
    wm.executableSelectWindow = null;
    wm.pendingExecutableSelectData = null;
  });

  const openDevToolsInDev = process.env.OPEN_DEVTOOLS === "true";
  if ((!app.isPackaged || isStaging) && openDevToolsInDev) {
    win.webContents.openDevTools();
  }

  wm.executableSelectWindow = win;
}

export function showExecutableSelectWindow(wm: typeof WindowManager) {
  if (wm.executableSelectWindow && !wm.executableSelectWindow.isDestroyed()) {
    wm.executableSelectWindow.show();
  }
}

export function closeExecutableSelectWindow(wm: typeof WindowManager) {
  if (wm.executableSelectWindow) {
    wm.executableSelectWindow.close();
    wm.executableSelectWindow = null;
  }
  wm.pendingExecutableSelectData = null;
}

export function getPendingExecutableSelectData(wm: typeof WindowManager): ExecutableSelectData | null {
  return wm.pendingExecutableSelectData;
}

export function clearPendingExecutableSelectData(wm: typeof WindowManager) {
  wm.pendingExecutableSelectData = null;
}
