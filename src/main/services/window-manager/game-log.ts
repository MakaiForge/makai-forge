import icon from "@assets/assets/icons/app/icon.png?asset";
import { BrowserWindow, app, screen } from "electron";
import { isStaging } from "@main/constants";
import type { WindowManager } from "../window-manager";
import { loadWindowURL } from "./load-url";

const WINDOW_WIDTH = 900;
const WINDOW_HEIGHT = 600;

export function createGameLogWindow(
  wm: typeof WindowManager,
  shop: string,
  objectId: string
) {
  if (wm.gameLogWindow) {
    wm.gameLogWindow.close();
    wm.gameLogWindow = null;
  }

  const display = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = display.bounds;

  const x = Math.round((displayWidth - WINDOW_WIDTH) / 2);
  const y = Math.round((displayHeight - WINDOW_HEIGHT) / 2);

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: false,
    title: `Log do Jogo - ${objectId}`,
    backgroundColor: "#0d0d0d",
    icon,
    skipTaskbar: false,
    webPreferences: {
      preload: require("node:path").join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
    show: false,
  });

  win.removeMenu();
  loadWindowURL(win, `game-log?shop=${encodeURIComponent(shop)}&objectId=${encodeURIComponent(objectId)}`);

  win.on("closed", () => {
    wm.gameLogWindow = null;
  });

  const openDevToolsInDev = process.env.OPEN_DEVTOOLS === "true";
  if ((!app.isPackaged || isStaging) && openDevToolsInDev) {
    win.webContents.openDevTools();
  }

  wm.gameLogWindow = win;
}

export function showGameLogWindow(wm: typeof WindowManager) {
  if (wm.gameLogWindow && !wm.gameLogWindow.isDestroyed()) {
    wm.gameLogWindow.show();
  }
}

export function closeGameLogWindow(wm: typeof WindowManager) {
  if (wm.gameLogWindow) {
    wm.gameLogWindow.close();
    wm.gameLogWindow = null;
  }
}
