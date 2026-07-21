import { registerEvent } from "@main/events/register-event";
import { UpdateManager } from "../update-manager";

const checkForUpdates = async (_event: Electron.IpcMainInvokeEvent) => {
  return UpdateManager.checkForUpdates();
};

registerEvent("checkForUpdates", checkForUpdates);
