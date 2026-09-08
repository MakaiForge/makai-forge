import icon from "@assets/assets/icons/app/icon.png?asset";
import { BrowserWindow, app, screen } from "electron";
import { isStaging } from "@main/constants";
import type { WindowManager } from "../window-manager";
import type { FileSelectData } from "./types";
import { loadWindowURL } from "./load-url";

const WINDOW_WIDTH = 700;
const WINDOW_HEIGHT = 560;

export function createFolderSelectWindow(
  wm: typeof WindowManager,
  data: FileSelectData
) {
  if (wm.folderSelectWindow) {
    wm.folderSelectWindow.close();
    wm.folderSelectWindow = null;
  }

  wm.pendingFileSelectData = data;

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
  loadWindowURL(win, "folder-select");

  win.on("closed", () => {
    wm.folderSelectWindow = null;
    wm.pendingFileSelectData = null;
  });

  const openDevToolsInDev = process.env.OPEN_DEVTOOLS === "true";
  if ((!app.isPackaged || isStaging) && openDevToolsInDev) {
    win.webContents.openDevTools();
  }

  wm.folderSelectWindow = win;
}

export function showFolderSelectWindow(wm: typeof WindowManager) {
  if (wm.folderSelectWindow && !wm.folderSelectWindow.isDestroyed()) {
    wm.folderSelectWindow.show();
  }
}

export function closeFolderSelectWindow(wm: typeof WindowManager) {
  if (wm.folderSelectWindow) {
    wm.folderSelectWindow.close();
    wm.folderSelectWindow = null;
  }
  wm.pendingFileSelectData = null;
}

export function getPendingFileSelectData(wm: typeof WindowManager): FileSelectData | null {
  return wm.pendingFileSelectData;
}

export function clearPendingFileSelectData(wm: typeof WindowManager) {
  wm.pendingFileSelectData = null;
}
