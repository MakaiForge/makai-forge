import { BrowserWindow, app, screen } from "electron";
import path from "node:path";
import type { WindowManager } from "../window-manager";

const WINDOW_WIDTH = 520;
const WINDOW_HEIGHT = 440;

export function createCompactFlowWindow(wm: typeof WindowManager): void {
  if (wm.compactFlowWindow && !wm.compactFlowWindow.isDestroyed()) {
    wm.compactFlowWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = display.bounds;
  const x = Math.round((displayWidth - WINDOW_WIDTH) / 2);
  const y = Math.round((displayHeight - WINDOW_HEIGHT) / 2);

  const cfDir = app.isPackaged
    ? path.join(process.resourcesPath, "app", "_resources", "compact-flow")
    : path.join(app.getAppPath(), "app", "_resources", "compact-flow");

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(cfDir, "main", "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.removeMenu();
  win.loadFile(path.join(cfDir, "renderer", "index.html"));

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    wm.compactFlowWindow = null;
  });

  const statePath = path.join(cfDir, "main", "state.js");
  try {
    const cfState = require(statePath);
    cfState.setCompactFlowWindow(win);
  } catch (e) {
    console.error("[CompactFlow] Failed to set window ref:", e);
  }

  wm.compactFlowWindow = win;
}
