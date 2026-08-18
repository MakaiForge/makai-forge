import { app, session, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { electronApp } from "@electron-toolkit/utils";
import i18n from "i18next";
import { logger, WindowManager } from "./services";
import { ensureVenv } from "@bootstrap/venv";
import { ensureResources } from "@bootstrap/resource-manager";
import {
  startQBittorrent,
  waitForQBittorrent,
  isQBittorrentAlive,
} from "./services/qbittorrent";
import { registerProtocols } from "./services/protocols";
import { prewarmLibraryImages } from "./services/image-cache";
import { db, storeKeys } from "@main/store";
import { migrateJsonToSqlite } from "@main/services/sqlite-store";
import { loadState } from "./main";
import { handleDeepLinkPath } from "./deep-link";

async function tryRefreshFlag() {
  const cfRefreshFlag = path.join(
    app.getPath("userData"), ".compatflow-refresh"
  );
  try {
    if (fs.existsSync(cfRefreshFlag)) {
      fs.unlinkSync(cfRefreshFlag);
      migrateJsonToSqlite();
      const win = WindowManager.mainWindow;
      if (win) {
        const wc = win.webContents;
        if (wc.isLoading()) {
          wc.once("did-finish-load", () => {
            win.webContents.send("on-library-batch-complete");
            logger.info("[CompatFlow] Startup: library refresh triggered");
          });
        } else {
          win.webContents.send("on-library-batch-complete");
          logger.info("[CompatFlow] Startup: library refresh triggered");
        }
      }
    }
  } catch {}
}

/**
 * Baixa as capas da biblioteca em segundo plano e, quando terminar, avisa o
 * renderer para refazer o fetch (agora com URLs locais `local://`).
 */
function prewarmAndRefreshLibrary() {
  prewarmLibraryImages().then((downloaded) => {
    if (downloaded <= 0) return;
    const win = WindowManager.mainWindow;
    if (win && !win.isDestroyed()) {
      const wc = win.webContents;
      if (wc.isLoading()) {
        wc.once("did-finish-load", () => {
          win.webContents.send("on-library-batch-complete");
        });
      } else {
        win.webContents.send("on-library-batch-complete");
      }
    }
  });
}

export async function bootstrap() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders;
    if (headers) {
      delete headers["content-security-policy"];
      delete headers["x-frame-options"];
      callback({ responseHeaders: headers });
    } else {
      callback({});
    }
  });

  electronApp.setAppUserModelId("com.makaiforger.app");
  registerProtocols();

  const deepLinkArg = process.argv.find((arg) =>
    arg.startsWith("protonforge://")
  );
  const isRunDeepLink = deepLinkArg?.startsWith("protonforge://run");
  const exeArg = process.argv.find((arg) =>
    /\.(exe|msi|sh|AppImage)$/i.test(arg) && fs.existsSync(arg)
  );

  if (process.argv.includes("--hidden") || isRunDeepLink) {
    await loadState();
    ensureVenv();
    ensureResources();
    WindowManager.createMainWindow();
    prewarmAndRefreshLibrary();
    WindowManager.createSystemTray("en");
    if (deepLinkArg) await handleDeepLinkPath(deepLinkArg);
    else if (exeArg) {
      const { openCompatFlowWindow } = await import("@provision/compatflow-adapter");
      openCompatFlowWindow(exeArg);
    }
    return;
  }

  // Show setup window
  const setupWin = new BrowserWindow({
    width: 900,
    height: 680,
    frame: false,
    backgroundColor: "#0a0a0f",
    resizable: false,
    center: true,
    show: false,
    title: "Makai Forge",
    webPreferences: {
      preload: path.join(__dirname, "../preload/setup.mjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const { createSetupWindow, sendSetupComplete } = await import("@bootstrap/setup-window");
  createSetupWindow(setupWin);
  WindowManager.setupWindow = setupWin;

  const setupStart = Date.now();

  // qBittorrent + venv + resources rodam em paralelo (antes eram sequenciais).
  const qbtLoop = (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await startQBittorrent();
      const ready = await waitForQBittorrent();
      if (ready) break;

      if (!isQBittorrentAlive() && attempt < 3) {
        logger.warn(`[QBittorrent] Attempt ${attempt}/3 failed, retrying in 1s...`);
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        logger.warn("[QBittorrent] Continuing without torrent support");
        break;
      }
    }
  })();

  await Promise.all([
    ensureVenv().then((ok) => {
      logger.info(`[bootstrap] Venv: ${ok ? "pronto" : "falha"}`);
    }),
    ensureResources().then((ok) => {
      logger.info(`[bootstrap] Resources: ${ok ? "pronto" : "falha"}`);
    }),
    qbtLoop,
  ]);

  const elapsed = Date.now() - setupStart;
  const minDelay = 800;
  if (elapsed < minDelay) {
    await new Promise((r) => setTimeout(r, minDelay - elapsed));
  }

  sendSetupComplete(WindowManager);
  await new Promise((r) => setTimeout(r, 300));

  try { WindowManager.setupWindow?.close(); } catch {}
  WindowManager.setupWindow = null;

  const language = await db
    .get<string, string>(storeKeys.language, { valueEncoding: "utf8" })
    .catch(() => "en");

  if (language) i18n.changeLanguage(language);

  WindowManager.createMainWindow();
  await loadState();
  await tryRefreshFlag();
  prewarmAndRefreshLibrary();
  WindowManager.createSystemTray(language || "en");

  if (exeArg) {
    const { openCompatFlowWindow } = await import("@provision/compatflow-adapter");
    openCompatFlowWindow(exeArg);
  }

  const { startRunnerUpdater } = await import("./services/runner-updater");
  startRunnerUpdater();
}
