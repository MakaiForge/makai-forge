import { ipcRenderer } from "electron";

export const supplementalAPI = {
  checkSequence: (keys: number[]) =>
    ipcRenderer.invoke("supplemental:check", keys) as Promise<{ unlocked: boolean }>,
  getFeatureState: () =>
    ipcRenderer.invoke("supplemental:status") as Promise<{ unlocked: boolean }>,
  getGameData: (shop: string, objectId: string) =>
    ipcRenderer.invoke("supplemental:getGameData", shop, objectId),
  getGameDataBatch: (entries: { shop: string; objectId: string }[]) =>
    ipcRenderer.invoke("supplemental:getGameDataBatch", entries),
  debug: () =>
    ipcRenderer.invoke("supplemental:debug") as Promise<{
      unlockState: boolean;
      dbValue: boolean | null;
      mapSize: number;
      totalGames: number;
    }>,
};
