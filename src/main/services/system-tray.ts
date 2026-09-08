import { Menu, MenuItem, MenuItemConstructorOptions, Tray, app, shell } from "electron";
import { t } from "i18next";
import { orderBy, slice } from "lodash-es";
import trayIcon from "@assets/assets/icons/app/tray-icon.png?asset";
import { gamesStore } from "@main/store";
import type { WindowManager } from "./window-manager";

export async function createSystemTray(windowManager: typeof WindowManager, language: string) {
  let tray: Tray;

  tray = new Tray(trayIcon);

  const updateSystemTray = async () => {
    const games = await gamesStore
      .values()
      .all()
      .then((games) => {
        const filteredGames = games.filter(
          (game) =>
            !game.isDeleted && game.executablePath && game.lastTimePlayed
        );

        const sortedGames = orderBy(filteredGames, "lastTimePlayed", "desc");

        return slice(sortedGames, 0, 6);
      });

    const recentlyPlayedGames: Array<MenuItemConstructorOptions | MenuItem> =
      games.map(({ title, executablePath }) => ({
        label: title.length > 18 ? `${title.slice(0, 18)}…` : title,
        type: "normal",
        click: async () => {
          if (!executablePath) return;
          shell.openPath(executablePath);
        },
      }));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: t("open", {
          ns: "system_tray",
          lng: language,
        }),
        type: "normal",
        click: () => {
          if (windowManager.mainWindow) {
            windowManager.mainWindow.show();
          } else {
            windowManager.createMainWindow();
          }
        },
      },
      {
        type: "separator",
      },
      ...recentlyPlayedGames,
      {
        type: "separator",
      },
      {
        label: t("quit", {
          ns: "system_tray",
          lng: language,
        }),
        type: "normal",
        click: () => app.quit(),
      },
    ]);

    if (process.platform === "linux") {
      tray.setContextMenu(contextMenu);
    }

    return contextMenu;
  };

  const showContextMenu = async () => {
    const contextMenu = await updateSystemTray();
    tray.popUpContextMenu(contextMenu);
  };

  tray.setToolTip("Makai Forge");

  await updateSystemTray();

  tray.addListener("click", () => {
    if (windowManager.mainWindow) {
      windowManager.mainWindow.show();
    } else {
      windowManager.createMainWindow();
    }
  });

  tray.addListener("right-click", showContextMenu);
}
