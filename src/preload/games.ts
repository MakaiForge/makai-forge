import { ipcRenderer } from "electron";

export const gamesAPI = {
  syncSteamLibrary: () => ipcRenderer.invoke("syncSteamLibrary"),
  getSteamGameConfig: (appId: string) =>
    ipcRenderer.invoke("getSteamGameConfig", appId),
  setSteamGameConfig: (appId: string, config: Record<string, any>) =>
    ipcRenderer.invoke("setSteamGameConfig", appId, config),
  clearSteamPrefix: (appId: string, protonName?: string) =>
    ipcRenderer.invoke("clearSteamPrefix", appId, protonName),
  ensureGamePrefix: (appId: string, protonName?: string) =>
    ipcRenderer.invoke("ensureGamePrefix", appId, protonName),
  getSteamGameProton: (appId: string) =>
    ipcRenderer.invoke("getSteamGameProton", appId),
  setSteamGameProton: (appId: string, protonName: string | null) =>
    ipcRenderer.invoke("setSteamGameProton", appId, protonName),
  getCompatibilityTools: () => ipcRenderer.invoke("getCompatibilityTools"),
};
