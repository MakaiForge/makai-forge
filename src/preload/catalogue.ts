import { ipcRenderer } from "electron";
import type { GameShop } from "@types";

export const catalogueAPI = {
  getGameShopDetails: (objectId: string, shop: GameShop, language: string) =>
    ipcRenderer.invoke("getGameShopDetails", objectId, shop, language),
  getRandomGame: () => ipcRenderer.invoke("getRandomGame"),
  getLocalResource: (filename: string) =>
    ipcRenderer.invoke("getLocalResource", filename),
  getGameStats: (objectId: string, shop: GameShop) =>
    ipcRenderer.invoke("getGameStats", objectId, shop),
  getGameAssets: (objectId: string, shop: GameShop) =>
    ipcRenderer.invoke("getGameAssets", objectId, shop),
  getGamePrices: (steamAppId: string, language?: string) =>
    ipcRenderer.invoke("getGamePrices", steamAppId, language),
};
