import { registerEvent } from "@main/events/register-event";
import { deleteGamePrefix } from "../core/clear";
import { deleteGameFromDatabase } from "@games-ui/services/delete-game";
import type { GameShop } from "@types";
import { logOperation } from "../activity-logger";

const deleteGamePrefixHandler = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
): Promise<void> => {
  logOperation("deleteGamePrefix", "started", { shop, objectId });
  await deleteGamePrefix(shop, objectId);
  logOperation("deleteGamePrefix", "success", { shop, objectId });
};

const deleteGameWithPrefixHandler = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
): Promise<void> => {
  logOperation("deleteGameWithPrefix", "started", { shop, objectId });
  try {
    await deleteGamePrefix(shop, objectId);
    await deleteGameFromDatabase(shop, objectId);
    logOperation("deleteGameWithPrefix", "success", { shop, objectId });
  } catch (err) {
    logOperation("deleteGameWithPrefix", "error", { shop, objectId, error: String(err) });
    throw err;
  }
};

registerEvent("deleteGamePrefix", deleteGamePrefixHandler);
registerEvent("deleteGameWithPrefix", deleteGameWithPrefixHandler);
