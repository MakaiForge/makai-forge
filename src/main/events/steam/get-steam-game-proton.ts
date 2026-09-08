import { registerEvent } from "../register-event";
import { getSteamGameProton } from "@main/services/steam-config-vdf";

const getSteamGameProtonHandler = async (
  _event: Electron.IpcMainInvokeEvent,
  appId: string
) => {
  return getSteamGameProton(appId);
};

registerEvent("getSteamGameProton", getSteamGameProtonHandler);
