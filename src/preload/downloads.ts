import { ipcRenderer } from "electron";
import type {
  GameShop,
  DownloadProgress,
  StartGameDownloadPayload,
  SeedingStatus,
  TorrentFilesResponse,
} from "@types";

export const downloadsAPI = {
  startGameDownload: (payload: StartGameDownloadPayload) =>
    ipcRenderer.invoke("startGameDownload", payload),
  addGameToQueue: (payload: StartGameDownloadPayload) =>
    ipcRenderer.invoke("addGameToQueue", payload),
  cancelGameDownload: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("cancelGameDownload", shop, objectId),
  pauseGameDownload: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("pauseGameDownload", shop, objectId),
  resumeGameDownload: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("resumeGameDownload", shop, objectId),
  pauseGameSeed: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("pauseGameSeed", shop, objectId),
  resumeGameSeed: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("resumeGameSeed", shop, objectId),
  updateDownloadQueuePosition: (
    shop: GameShop,
    objectId: string,
    direction: "up" | "down"
  ) => ipcRenderer.invoke("updateDownloadQueuePosition", shop, objectId, direction),
  onDownloadProgress: (cb: (value: DownloadProgress | null) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: DownloadProgress | null) => cb(value);
    ipcRenderer.on("on-download-progress", listener);
    return () => ipcRenderer.removeListener("on-download-progress", listener);
  },
  onProtonDownloadProgress: (
    cb: (value: { toolId: string; version: string; percent: number; speed: string } | null) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { toolId: string; version: string; percent: number; speed: string } | null
    ) => cb(value);
    ipcRenderer.on("on-proton-download-progress", listener);
    return () => ipcRenderer.removeListener("on-proton-download-progress", listener);
  },
  ensureVenv: () => ipcRenderer.invoke("ensureVenv"),
  onVenvProgress: (
    cb: (value: { status: string; percent: number } | null) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { status: string; percent: number } | null
    ) => cb(value);
    ipcRenderer.on("on-venv-progress", listener);
    return () => ipcRenderer.removeListener("on-venv-progress", listener);
  },
  onInstallProgress: (
    cb: (value: { status: string; percent: number; gameTitle?: string } | null) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { status: string; percent: number; gameTitle?: string } | null
    ) => cb(value);
    ipcRenderer.on("on-install-progress", listener);
    return () => ipcRenderer.removeListener("on-install-progress", listener);
  },
  onInstallLog: (cb: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => cb(line);
    ipcRenderer.on("on-install-log", listener);
    return () => ipcRenderer.removeListener("on-install-log", listener);
  },
  setGameExecutablePath: (shop: GameShop, objectId: string, executablePath: string): Promise<void> =>
    ipcRenderer.invoke("setGameExecutablePath", shop, objectId, executablePath),
  openExeFilePicker: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke("openExeFilePicker", defaultPath),
  onHardDelete: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-hard-delete", listener);
    return () => ipcRenderer.removeListener("on-hard-delete", listener);
  },
  onSeedingStatus: (cb: (value: SeedingStatus[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: SeedingStatus[]) => cb(value);
    ipcRenderer.on("on-seeding-status", listener);
    return () => ipcRenderer.removeListener("on-seeding-status", listener);
  },
  checkDebridAvailability: (magnets: string[]) =>
    ipcRenderer.invoke("checkDebridAvailability", magnets),
  getTorrentFiles: (magnet: string) =>
    ipcRenderer.invoke("getTorrentFiles", magnet) as Promise<
      { ok: true; data: TorrentFilesResponse } | { ok: false; error: string }
    >,

  pauseGameTransfer: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("pauseGameTransfer", shop, objectId),
  resumeGameTransfer: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("resumeGameTransfer", shop, objectId),
  cancelGameTransfer: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("cancelGameTransfer", shop, objectId),

  on: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  off: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.off(channel, listener);
  },
  getAvailableDrives: () => ipcRenderer.invoke("getAvailableDrives"),
  transferGameFiles: (shop: GameShop, objectId: string, destParent: string) =>
    ipcRenderer.invoke("transferGameFiles", shop, objectId, destParent),
};
