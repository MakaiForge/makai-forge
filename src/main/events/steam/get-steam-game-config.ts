import { registerEvent } from "../register-event";
import { db } from "@main/store";

const getSteamGameConfig = async (
  _event: Electron.IpcMainInvokeEvent,
  appId: string
): Promise<Record<string, any> | null> => {
  return db
    .get(`steam_config:${appId}`, { valueEncoding: "json" })
    .catch(() => null);
};

registerEvent("getSteamGameConfig", getSteamGameConfig);
