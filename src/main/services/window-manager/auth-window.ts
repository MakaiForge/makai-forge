import type { AuthPage } from "@shared";
import { BrowserWindow, app } from "electron";
import type { WindowManager } from "../window-manager";
import { db, storeKeys } from "@main/store";
import type { Auth, User } from "@types";
import { logger } from "../logger";

function tryParseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed === "object" && parsed.id) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

export function openAuthWindow(
  wm: typeof WindowManager,
  page: AuthPage,
  searchParams: URLSearchParams
) {
  if (!wm.mainWindow) return;

  const authWindow = new BrowserWindow({
    width: 600,
    height: 640,
    backgroundColor: "#1c1c1c",
    parent: wm.mainWindow,
    modal: true,
    show: false,
    maximizable: false,
    resizable: false,
    minimizable: false,
    webPreferences: {
      sandbox: false,
      nodeIntegrationInSubFrames: true,
    },
  });

  authWindow.removeMenu();

  if (!app.isPackaged) {
    authWindow.webContents.openDevTools();
  }

  authWindow.loadURL(
    `${import.meta.env.MAIN_VITE_AUTH_URL}${page}?${searchParams.toString()}`
  );

  authWindow.once("ready-to-show", () => {
    authWindow.show();
  });

  const handleCallback = async (url: string) => {
    if (url.startsWith("protonforge://auth")) {
      logger.log("[auth] Callback received:", url);
      authWindow.close();

      const callbackUrl = new URL(url);
      const accessToken = callbackUrl.searchParams.get("access_token");
      const refreshToken = callbackUrl.searchParams.get("refresh_token");
      const expiresAt = callbackUrl.searchParams.get("expires_at");

      logger.log("[auth] access_token present:", !!accessToken);

      if (accessToken) {
        const auth: Auth = {
          accessToken,
          refreshToken: refreshToken ?? "",
          tokenExpirationTimestamp: expiresAt
            ? Number(expiresAt)
            : Date.now() + 3600_000,
        };
        await db.put(storeKeys.auth, auth);
        logger.log("[auth] Auth saved to DB");

        const user = tryParseUser(callbackUrl.searchParams.get("user"));
        if (user) {
          await db.put(storeKeys.user, user);
          logger.log("[auth] User saved to DB");
        } else {
          logger.log("[auth] No user data in callback");
        }
      }

      wm.mainWindow?.webContents.send("on-signin");
      logger.log("[auth] on-signin sent to renderer");
      return;
    }

    if (url.startsWith("protonforge://update-account")) {
      logger.log("[auth] Update account callback:", url);
      authWindow.close();
      wm.mainWindow?.webContents.send("on-account-updated");
    }
  };

  authWindow.webContents.on("will-navigate", async (_event, url) => {
    logger.log("[auth] will-navigate:", url);
    await handleCallback(url);
  });

  authWindow.webContents.on("did-navigate", async (_event, url) => {
    logger.log("[auth] did-navigate:", url);
    await handleCallback(url);
  });
}
