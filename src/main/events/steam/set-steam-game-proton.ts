import { registerEvent } from "../register-event";
import { setSteamGameProton } from "@main/services/steam-config-vdf";

const setSteamGameProtonHandler = async (
  _event: Electron.IpcMainInvokeEvent,
  appId: string,
  protonName: string | null
) => {
  return setSteamGameProton(appId, protonName);
};

registerEvent("setSteamGameProton", setSteamGameProtonHandler);
