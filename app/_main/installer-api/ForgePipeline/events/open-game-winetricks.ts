import { spawn } from "node:child_process";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { logger, Wine } from "@main/services";
import type { GameShop } from "@types";

const openGameWinetricks = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<boolean> => {
  if (process.platform !== "linux") {
    return false;
  }

  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) return false;

  const winePrefixPath = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    objectId
  );

  if (!winePrefixPath) {
    return false;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("winetricks", ["--gui"], {
        detached: true,
        stdio: "ignore",
        shell: false,
        env: {
          ...process.env,
          WINEPREFIX: winePrefixPath,
        },
      });

      child.once("spawn", () => {
        child.unref();
        resolve();
      });

      child.once("error", reject);
    });

    return true;
  } catch (error) {
    logger.error("Failed to launch winetricks", error);
    return false;
  }
};

registerEvent("openGameWinetricks", openGameWinetricks);
