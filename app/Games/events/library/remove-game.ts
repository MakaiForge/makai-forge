import { registerEvent } from "@main/events/register-event";
import { storeKeys, downloadsStore } from "@main/store";
import { GameShop } from "@types";

const removeGame = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const downloadKey = storeKeys.game(shop, objectId);
  await downloadsStore.del(downloadKey);
};

registerEvent("removeGame", removeGame);
