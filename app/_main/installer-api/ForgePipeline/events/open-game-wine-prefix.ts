import { shell } from "electron";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { GameShop } from "@types";
import { Wine } from "@provision/ForgePipeline/services/wine";

const openGameWinePrefix = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const game = await gamesStore.get(storeKeys.game(shop, objectId));

  if (!game) return;

  const prefixPath = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    game.objectId
  );

  if (!prefixPath) return;

  shell.openPath(prefixPath);
};

registerEvent("openGameWinePrefix", openGameWinePrefix);
