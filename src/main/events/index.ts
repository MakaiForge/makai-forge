import { appVersion, defaultDownloadsPath, isStaging } from "@main/constants";
import { ipcMain } from "electron";

console.log("[Events] events/index.ts loaded");

import "./auth";
import "@bootstrap/autoupdater";
import "./backup";
import "./catalogue";
import "./cloud-save";
import "./download-sources";
import "./games-json";
import "./games";
import "./hardware";
import "./library";
import "./store-handlers";
import "./home";
import "./misc";
import "./notifications";
import "./profile";
import "./proton";
import "./themes";
import "./steam";
import "./torrenting";
import "./scripts";
import "./runners";
import "./admin";
import "./achievements/get-achievement-icon";
import "./supplemental";
import "./user";
import "./user-preferences";
import "./library/transfer-game-files";
import "./library/update-game-config";
import "./library/check-game-dlls";
import "@mods/events/mod-deploy";
import "@mods/events/mod-launch";
import "@mods/events/mod-config";
import "@mods/events/mod-media";
import "@mods/events/mod-ini";

import "@mods/events/mod-fomod";
import "@mods/events/mod-proton";
import "@mods/events/mod-conflicts";
import "@mods/events/mod-bridge";
import "@mods/events/mod-load-order";
import "@mods/events/mod-storage";
import "@mods/events/mod-exe-launcher";
import "@mods/events/mod-eslifier";
import "@mods/events/mod-backup";
import "@mods/events/mod-known-games";
import "@mods/events/mod-run-wine-tool";
import "@mods/events/mod-prefix-rpc";
import "@mods/events/mod-switch-proton";
import "@mods/play";
import { registerChromeBrowserEvents } from "./chrome-browser";

registerChromeBrowserEvents();

import { registerProtonEvents } from "./proton";

registerProtonEvents();


import "./game-log/get-game-log-lines";
import "./game-log/clear-game-log";
import { setGameLogRendererSend } from "@main/services/game-log-manager";
import { WindowManager } from "@main/services";

setGameLogRendererSend((shop, objectId, lines) => {
  const sendToWin = (win: Electron.BrowserWindow | null) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("on-game-log-line", { shop, objectId, lines });
    }
  };
  sendToWin(WindowManager.mainWindow);
  sendToWin(WindowManager.gameLogWindow);
});

import { isPortableVersion } from "@main/helpers";

ipcMain.handle("ping", () => "pong");
ipcMain.handle("getVersion", () => appVersion);
ipcMain.handle("isStaging", () => isStaging);
ipcMain.handle("isPortableVersion", () => isPortableVersion());
ipcMain.handle("getDefaultDownloadsPath", () => defaultDownloadsPath);
