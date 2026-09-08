import { isStaging } from "@main/constants";
import { db, storeKeys } from "@main/store";
import { logger } from "../logger";
import type { UserPreferences } from "@types";
import { BrowserWindow, app, shell, screen } from "electron";
import { ALLOWED_DOMAINS, CORS_ALLOWED_HEADERS, REALISTIC_UA } from "../webrequest.config";
import type { WindowManager } from "../window-manager";
import { saveScreenConfig, loadScreenConfig } from "./screen-config";
import { loadWindowURL } from "./load-url";

function clampWindowToScreen(
  config: Electron.BrowserWindowConstructorOptions
): Electron.BrowserWindowConstructorOptions {
  const { workArea } = screen.getPrimaryDisplay();

  const maxW = workArea.width - 10;
  const maxH = workArea.height - 85;

  const clamped = {
    ...config,
    width: Math.min(config.width ?? maxW, maxW),
    height: Math.min(config.height ?? maxH, maxH),
    minWidth: Math.min(config.minWidth ?? 800, maxW),
    minHeight: Math.min(config.minHeight ?? 600, maxH),
  };

  logger.log(`[Screen] workArea=${workArea.width}x${workArea.height}`);
  logger.log(`[Screen] maxH=${maxH} clamped=${clamped.height}`);

  return clamped;
}

export async function createMainWindow(wm: typeof WindowManager) {
  if (wm.mainWindow) return;

  const { isMaximized = false, ...configWithoutMaximized } =
    await loadScreenConfig();

  let mainWindowConfig = clampWindowToScreen({
    ...wm.initialConfigInitializationMainWindow,
    ...configWithoutMaximized,
  });

  const mainWindow = new BrowserWindow(mainWindowConfig);

  if (isMaximized) mainWindow.maximize();

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    (details, callback) => {
      if (
        details.webContentsId !== mainWindow.webContents.id ||
        details.url.includes("chatwoot")
      ) {
        return callback(details);
      }

      const headers = { ...details.requestHeaders };

      headers["User-Agent"] = REALISTIC_UA;
      headers["Accept-Language"] = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7";
      headers["Sec-Ch-Ua"] = '"Chromium";v="148", "Not;A=Brand";v="99"';
      headers["Sec-Ch-Ua-Mobile"] = "?0";
      headers["Sec-Ch-Ua-Platform"] = '"Linux"';
      headers["Sec-Fetch-Site"] =
        details.resourceType === "mainFrame" ? "none" : "same-origin";
      headers["Sec-Fetch-Mode"] = "navigate";
      headers["Sec-Fetch-Dest"] =
        details.resourceType === "image" ? "image" : "document";

      delete headers["X-Electron-Version"];
      delete headers["X-Chrome-Version"];

      callback({ requestHeaders: headers });
    }
  );

  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      if (
        details.webContentsId !== mainWindow.webContents.id ||
        details.url.includes("chatwoot")
      ) {
        return callback(details);
      }

      const responseHeaders = { ...details.responseHeaders };

      const isAllowed = ALLOWED_DOMAINS.some((domain) =>
        details.url.includes(domain)
      );

      if (isAllowed) {
        // Usar origin específico em vez de * para prevenir ataques CSRF
        const origin = details.url.startsWith("https://")
          ? new URL(details.url).origin
          : "*";
        responseHeaders["Access-Control-Allow-Origin"] = [origin];
        responseHeaders["Access-Control-Allow-Methods"] = [
          "GET, POST, OPTIONS",
        ];
        responseHeaders["Access-Control-Allow-Headers"] = [
          CORS_ALLOWED_HEADERS.join(", "),
        ];
      }

      if (details.method === "OPTIONS") {
        return callback({
          cancel: false,
          responseHeaders,
          statusLine: "HTTP/1.1 200 OK",
        });
      }

      return callback({ responseHeaders });
    }
  );

  await loadWindowURL(mainWindow, "");
  mainWindow.removeMenu();

  mainWindow.on("ready-to-show", () => {
    const openDevToolsInDev = process.env.OPEN_DEVTOOLS === "true";
    if ((!app.isPackaged || isStaging) && openDevToolsInDev)
      mainWindow.webContents.openDevTools();
    mainWindow.show();
  });

  mainWindow.on("close", async () => {
    wm.mainWindow = null;

    const userPreferences = await db.get<string, UserPreferences>(
      storeKeys.userPreferences,
      { valueEncoding: "json" }
    ).catch(() => null);

    if (mainWindow) {
      mainWindow.setProgressBar(-1);

      const lastBounds = mainWindow.getBounds();
      const isMaximized = mainWindow.isMaximized() ?? false;
      const screenConfig = isMaximized
        ? {
            x: undefined,
            y: undefined,
            height: wm.initialConfigInitializationMainWindow.height ?? 860,
            width: wm.initialConfigInitializationMainWindow.width ?? 1200,
            isMaximized: true,
          }
        : { ...lastBounds, isMaximized };

      await saveScreenConfig(screenConfig);
    }

    if (userPreferences?.preferQuitInsteadOfHiding) {
      app.quit();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((handler) => {
    shell.openExternal(handler.url);
    return { action: "deny" };
  });

  wm.mainWindow = mainWindow;
}
