import { ipcRenderer } from "electron";

export const steamAPI = {
  syncSteamLibrary: () => ipcRenderer.invoke("syncSteamLibrary"),
  getSteamGameConfig: (appId: string) =>
    ipcRenderer.invoke("getSteamGameConfig", appId),
  setSteamGameConfig: (appId: string, config: Record<string, any>) =>
    ipcRenderer.invoke("setSteamGameConfig", appId, config),
};
