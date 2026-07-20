import { registerEvent } from "@main/events/register-event";
import { deleteGameFromDatabase } from "@games-ui/services/delete-game";
import type { GameShop } from "@types";

const deleteGameCompletely = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  await deleteGameFromDatabase(shop, objectId);
};

registerEvent("deleteGameCompletely", deleteGameCompletely);
