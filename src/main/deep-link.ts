import { WindowManager, logger } from "./services";
import { db, gamesStore, storeKeys } from "@main/store";
import type { Auth, GameShop, User, UserPreferences } from "@types";
import { launchGame } from "./helpers";

const handleRunGame = async (shop: GameShop, objectId: string) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);

  if (!game?.executablePath) {
    logger.error("Game not found or no executable path", { shop, objectId });
    return;
  }

  let userPreferences: UserPreferences | undefined;
  try {
    userPreferences = await db.get<string, UserPreferences>(
      storeKeys.userPreferences,
      { valueEncoding: "json" }
    );
  } catch {
    // Preferences not set yet
  }

  if (!userPreferences?.hideToTrayOnGameStart) {
    WindowManager.createMainWindow();
  }

  await launchGame({
    shop,
    objectId,
    executablePath: game.executablePath,
    launchOptions: game.launchOptions,
  });
};

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

export const handleDeepLinkPath = async (uri?: string) => {
  if (!uri) return;

  try {
    const url = new URL(uri);

    if (url.host === "auth") {
      logger.log("[deeplink] Auth callback received:", uri);
      const accessToken = url.searchParams.get("access_token");
      const refreshToken = url.searchParams.get("refresh_token");
      const expiresAt = url.searchParams.get("expires_at");

      logger.log("[deeplink] access_token present:", !!accessToken);

      if (accessToken) {
        const auth: Auth = {
          accessToken,
          refreshToken: refreshToken ?? "",
          tokenExpirationTimestamp: expiresAt
            ? Number(expiresAt)
            : Date.now() + 3600_000,
        };
        await db.put(storeKeys.auth, auth);
        logger.log("[deeplink] Auth saved to DB");

        const user = tryParseUser(url.searchParams.get("user"));
        if (user) {
          await db.put(storeKeys.user, user);
          logger.log("[deeplink] User saved to DB");
        } else {
          logger.log("[deeplink] No user data in callback");
        }
      }

      WindowManager.createMainWindow();
      if (WindowManager.mainWindow && !WindowManager.mainWindow.isDestroyed()) {
        WindowManager.mainWindow.webContents.send("on-signin");
        logger.log("[deeplink] on-signin sent to renderer");
      }
      return;
    }

    if (url.host === "run") {
      const shop = url.searchParams.get("shop") as GameShop | null;
      const objectId = url.searchParams.get("objectId");

      if (shop && objectId) {
        handleRunGame(shop, objectId);
      }

      return;
    }

    if (url.host === "install-source") {
      WindowManager.redirect(`settings${url.search}`);
      return;
    }

    if (url.host === "profile") {
      const userId = url.searchParams.get("userId");

      if (userId) {
        WindowManager.redirect(`profile/${userId}`);
      }

      return;
    }

    if (url.host === "install-theme") {
      const themeName = url.searchParams.get("theme");
      const authorId = url.searchParams.get("authorId");
      const authorName = url.searchParams.get("authorName");

      if (themeName && authorId && authorName) {
        WindowManager.redirect(
          `settings?theme=${themeName}&authorId=${authorId}&authorName=${authorName}`
        );
      }
    }

    if (url.host === "games") {
      if (WindowManager.mainWindow && !WindowManager.mainWindow.isDestroyed()) {
        WindowManager.mainWindow.webContents.executeJavaScript('window.location.hash = "/games"');
        if (WindowManager.mainWindow.isMinimized()) WindowManager.mainWindow.restore();
        WindowManager.mainWindow.focus();
      } else {
        WindowManager.redirect("/games");
      }
      return;
    }
  } catch (error) {
    logger.error("Error handling deep link", uri, error);
  }
};
