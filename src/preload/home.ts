import { ipcRenderer } from "electron";

export const homeAPI = {
  getHomeDeals: () => ipcRenderer.invoke("getHomeDeals"),
  getHomeDealsCached: () => ipcRenderer.invoke("getHomeDealsCached"),
  getLinuxNews: (language?: string) => ipcRenderer.invoke("getLinuxNews", language),
  getLinuxNewsCached: (language?: string) => ipcRenderer.invoke("getLinuxNewsCached", language),
  getFreeGames: (language?: string) => ipcRenderer.invoke("getFreeGames", language),
  getFreeGamesCached: () => ipcRenderer.invoke("getFreeGamesCached"),
};
