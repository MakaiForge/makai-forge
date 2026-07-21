import { app, BrowserWindow } from "electron";
import i18n from "i18next";
import { optimizer } from "@electron-toolkit/utils";
import {
  logger,
  clearGamesPlaytime,
  killRunningGameProcesses,
  WindowManager,
  Lock,
  PowerSaveBlockerManager,
} from "@main/services";
import { killQBittorrent } from "./services/qbittorrent";
import resources from "@locales";
import { PythonRPC } from "./services/python-rpc";
import "./events";
import { getChromeManager } from "./events/chrome-browser";
import { handleDeepLinkPath } from "./deep-link";
import { setupSecondInstance } from "./single-instance";
import { bootstrap } from "./bootstrap";

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();

if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
  app.commandLine.appendSwitch("--ozone-platform", "x11");
}

app.commandLine.appendSwitch("--enable-unsafe-swiftshader");

i18n.init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

const PROTOCOL = "protonforge";

if (app.isPackaged) {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

app.whenReady().then(() => bootstrap());

app.on("browser-window-created", (_, window) => {
  optimizer.watchWindowShortcuts(window);
});

setupSecondInstance();

app.on("open-url", async (_event, url) => {
  await handleDeepLinkPath(url);
});

app.on("window-all-closed", () => {
  WindowManager.mainWindow = null;
});

let canAppBeClosed = false;

app.on("before-quit", async (e) => {
  await Lock.releaseLock();

  if (!canAppBeClosed) {
    e.preventDefault();
    PowerSaveBlockerManager.reset();
    PythonRPC.kill();
    await killQBittorrent();
    await killRunningGameProcesses();
    await clearGamesPlaytime();
    const cm = getChromeManager();
    if (cm) await cm.close();
    canAppBeClosed = true;
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    WindowManager.createMainWindow();
  }
});
