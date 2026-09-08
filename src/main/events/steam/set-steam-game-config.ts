import { registerEvent } from "../register-event";
import { db } from "@main/store";

const setSteamGameConfig = async (
  _event: Electron.IpcMainInvokeEvent,
  appId: string,
  config: Record<string, any>
) => {
  await db.put(`steam_config:${appId}`, config, { valueEncoding: "json" });
};

registerEvent("setSteamGameConfig", setSteamGameConfig);
