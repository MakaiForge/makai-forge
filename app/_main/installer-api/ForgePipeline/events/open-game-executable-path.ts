import { shell } from "electron";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { GameShop } from "@types";

const openGameExecutablePath = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const game = await gamesStore.get(storeKeys.game(shop, objectId));

  if (!game || !game.executablePath) return;

  shell.showItemInFolder(game.executablePath);
};

registerEvent("openGameExecutablePath", openGameExecutablePath);
