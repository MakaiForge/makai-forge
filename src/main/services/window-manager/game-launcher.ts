import icon from "@assets/assets/icons/app/icon.png?asset";
import { BrowserWindow, app, screen } from "electron";
import { isStaging } from "@main/constants";
import type { WindowManager } from "../window-manager";
import { loadWindowURL } from "./load-url";
import path from "node:path";

const WINDOW_WIDTH = 488;
const WINDOW_HEIGHT = 200;

export async function createGameLauncherWindow(
  wm: typeof WindowManager,
  shop: string,
  objectId: string
) {
  if (wm.gameLauncherWindow) {
    wm.gameLauncherWindow.close();
    wm.gameLauncherWindow = null;
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
  const bgPath = app.isPackaged
    ? path.join(process.resourcesPath, "app", "_assets", "backgrounds", "setup.png")
    : path.join(app.getAppPath(), "app", "_assets", "backgrounds", "setup.png");
  await loadWindowURL(win, `game-launcher?shop=${shop}&objectId=${objectId}&bg=${encodeURIComponent(bgPath)}`);

  win.on("closed", () => {
    wm.gameLauncherWindow = null;
  });

  const openDevToolsInDev = process.env.OPEN_DEVTOOLS === "true";
  if ((!app.isPackaged || isStaging) && openDevToolsInDev) {
    win.webContents.openDevTools();
  }

  wm.gameLauncherWindow = win;
}

export function showGameLauncherWindow(wm: typeof WindowManager) {
  if (wm.gameLauncherWindow && !wm.gameLauncherWindow.isDestroyed()) {
    wm.gameLauncherWindow.show();
  }
}

export function closeGameLauncherWindow(wm: typeof WindowManager) {
  if (wm.gameLauncherWindow) {
    wm.gameLauncherWindow.close();
    wm.gameLauncherWindow = null;
  }
}
