import { ipcRenderer } from "electron";
import type { GameShop, GameRunning, ProtonVersion, CreateSteamShortcutOptions } from "@types";

export const libraryAPI = {
  toggleAutomaticCloudSync: (
    shop: GameShop, objectId: string, automaticCloudSync: boolean
  ) => ipcRenderer.invoke("toggleAutomaticCloudSync", shop, objectId, automaticCloudSync),
  toggleGameMangohud: (shop: GameShop, objectId: string, autoRunMangohud: boolean) =>
    ipcRenderer.invoke("toggleGameMangohud", shop, objectId, autoRunMangohud),
  toggleGameGamemode: (shop: GameShop, objectId: string, autoRunGamemode: boolean) =>
    ipcRenderer.invoke("toggleGameGamemode", shop, objectId, autoRunGamemode),
  isGamemodeAvailable: () => ipcRenderer.invoke("isGamemodeAvailable"),
  isMangohudAvailable: () => ipcRenderer.invoke("isMangohudAvailable"),
  isWinetricksAvailable: () => ipcRenderer.invoke("isWinetricksAvailable"),
  addGameToLibrary: (shop: GameShop, objectId: string, title: string) =>
    ipcRenderer.invoke("addGameToLibrary", shop, objectId, title),
  addCustomGameToLibrary: (
    title: string, executablePath: string, iconUrl?: string, logoImageUrl?: string, libraryHeroImageUrl?: string,
    runner?: string, protonVersion?: string, protonPath?: string, prefix?: string
  ) => ipcRenderer.invoke("addCustomGameToLibrary", title, executablePath, iconUrl, logoImageUrl, libraryHeroImageUrl, runner, protonVersion, protonPath, prefix),
  updateGameConfig: (shop: GameShop, objectId: string, config: Record<string, any>) =>
    ipcRenderer.invoke("updateGameConfig", shop, objectId, config),
  copyCustomGameAsset: (sourcePath: string, assetType: "icon" | "logo" | "hero") =>
    ipcRenderer.invoke("copyCustomGameAsset", sourcePath, assetType),
  saveTempFile: (fileName: string, fileData: Uint8Array) =>
    ipcRenderer.invoke("saveTempFile", fileName, fileData),
  deleteTempFile: (filePath: string) => ipcRenderer.invoke("deleteTempFile", filePath),
  cleanupUnusedAssets: () => ipcRenderer.invoke("cleanupUnusedAssets"),
  updateCustomGame: (params: {
    shop: GameShop; objectId: string; title: string;
    iconUrl?: string; logoImageUrl?: string; libraryHeroImageUrl?: string;
    originalIconPath?: string; originalLogoPath?: string; originalHeroPath?: string;
  }) => ipcRenderer.invoke("updateCustomGame", params),
  updateGameCustomAssets: (params: {
    shop: GameShop; objectId: string; title: string;
    customIconUrl?: string | null; customLogoImageUrl?: string | null; customHeroImageUrl?: string | null;
    customOriginalIconPath?: string | null; customOriginalLogoPath?: string | null; customOriginalHeroPath?: string | null;
  }) => ipcRenderer.invoke("updateGameCustomAssets", params),
  createGameShortcut: (shop: GameShop, objectId: string, location: string) =>
    ipcRenderer.invoke("createGameShortcut", shop, objectId, location),
  updateExecutablePath: (shop: GameShop, objectId: string, executablePath: string | null) =>
    ipcRenderer.invoke("updateExecutablePath", shop, objectId, executablePath),
  addGameToFavorites: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("addGameToFavorites", shop, objectId),
  removeGameFromFavorites: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("removeGameFromFavorites", shop, objectId),
  assignGameToCollection: (shop: GameShop, objectId: string, collectionIds: string[]) =>
    ipcRenderer.invoke("assignGameToCollection", shop, objectId, collectionIds),
  clearNewDownloadOptions: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("clearNewDownloadOptions", shop, objectId),
  toggleGamePin: (shop: GameShop, objectId: string, pinned: boolean) =>
    ipcRenderer.invoke("toggleGamePin", shop, objectId, pinned),
  updateLaunchOptions: (shop: GameShop, objectId: string, launchOptions: string | null) =>
    ipcRenderer.invoke("updateLaunchOptions", shop, objectId, launchOptions),
  selectGameWinePrefix: (shop: GameShop, objectId: string, winePrefixPath: string | null) =>
    ipcRenderer.invoke("selectGameWinePrefix", shop, objectId, winePrefixPath),
  selectGameProtonPath: (shop: GameShop, objectId: string, protonPath: string | null) =>
    ipcRenderer.invoke("selectGameProtonPath", shop, objectId, protonPath),
  getInstalledProtonVersions: () =>
    ipcRenderer.invoke("getInstalledProtonVersions") as Promise<ProtonVersion[]>,
  recommendProton: (gameId: string) => ipcRenderer.invoke("recommendProton", gameId),
  getProtonDbData: (gameId: string) =>
    ipcRenderer.invoke("getProtonDbData", gameId),
  getGameLaunchProtonVersion: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("getGameLaunchProtonVersion", shop, objectId),
  verifyExecutablePathInUse: (executablePath: string) =>
    ipcRenderer.invoke("verifyExecutablePathInUse", executablePath),
  getLibrary: () => ipcRenderer.invoke("getLibrary"),
  refreshLibraryAssets: () => ipcRenderer.invoke("refreshLibraryAssets"),
  openGameInstaller: (shop: GameShop, objectId: string, protonPath?: string | null, gameTitle?: string | null, folderName?: string | null) =>
    ipcRenderer.invoke("openGameInstaller", shop, objectId, protonPath, gameTitle, folderName),
  getGameInstallerActionType: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("getGameInstallerActionType", shop, objectId),
  openGameInstallerPath: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("openGameInstallerPath", shop, objectId),
  openGameWinetricks: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("openGameWinetricks", shop, objectId),
  checkGameDlls: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("checkGameDlls", shop, objectId),
  runWineTool: (shop: GameShop, objectId: string, tool: string) =>
    ipcRenderer.invoke("runWineTool", shop, objectId, tool),
  openGameExecutablePath: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("openGameExecutablePath", shop, objectId),
  openGameWinePrefix: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("openGameWinePrefix", shop, objectId),
  getGameSaveFolder: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("getGameSaveFolder", shop, objectId),
  openGameSaveFolder: (shop: GameShop, objectId: string, saveFolderPath: string) =>
    ipcRenderer.invoke("openGameSaveFolder", shop, objectId, saveFolderPath),
  openGame: (shop: GameShop, objectId: string, executablePath: string, launchOptions?: string | null) =>
    ipcRenderer.invoke("openGame", shop, objectId, executablePath, launchOptions),
  closeGame: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("closeGame", shop, objectId),
  removeGameFromLibrary: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("removeGameFromLibrary", shop, objectId),
  removeGame: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("removeGame", shop, objectId),
  deleteGameFolder: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("deleteGameFolder", shop, objectId),
  deleteGamePrefix: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("deleteGamePrefix", shop, objectId),
  deleteGameCompletely: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("deleteGameCompletely", shop, objectId),
  deleteGameWithPrefix: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("deleteGameWithPrefix", shop, objectId),
  downloadGameCovers: (steamAppId: string, objectId: string, gameTitle: string) =>
    ipcRenderer.invoke("downloadGameCovers", steamAppId, objectId, gameTitle),
  getGameByObjectId: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("getGameByObjectId", shop, objectId),
  changeGamePlayTime: (shop: GameShop, objectId: string, playtime: number) =>
    ipcRenderer.invoke("changeGamePlayTime", shop, objectId, playtime),
  extractGameDownload: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("extractGameDownload", shop, objectId),
  scanInstalledGames: () => ipcRenderer.invoke("scanInstalledGames"),
  getDefaultWinePrefixSelectionPath: () =>
    ipcRenderer.invoke("getDefaultWinePrefixSelectionPath"),
  createSteamShortcut: (shop: GameShop, objectId: string, options?: CreateSteamShortcutOptions) =>
    ipcRenderer.invoke("createSteamShortcut", shop, objectId, options),
  deleteSteamShortcut: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("deleteSteamShortcut", shop, objectId),
  checkSteamShortcut: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("checkSteamShortcut", shop, objectId),
  onGamesRunning: (
    cb: (gamesRunning: Pick<GameRunning, "id" | "sessionDurationInMillis">[]) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, gamesRunning: any) => cb(gamesRunning);
    ipcRenderer.on("on-games-running", listener);
    return () => ipcRenderer.removeListener("on-games-running", listener);
  },
  onLibraryBatchComplete: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-library-batch-complete", listener);
    return () => ipcRenderer.removeListener("on-library-batch-complete", listener);
  },
  onExtractionComplete: (cb: (shop: GameShop, objectId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, shop: GameShop, objectId: string) => cb(shop, objectId);
    ipcRenderer.on("on-extraction-complete", listener);
    return () => ipcRenderer.removeListener("on-extraction-complete", listener);
  },
  onExtractionProgress: (
    cb: (shop: GameShop, objectId: string, progress: number) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, shop: GameShop, objectId: string, progress: number) =>
      cb(shop, objectId, progress);
    ipcRenderer.on("on-extraction-progress", listener);
    return () => ipcRenderer.removeListener("on-extraction-progress", listener);
  },
  onExtractionFailed: (cb: (shop: GameShop, objectId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, shop: GameShop, objectId: string) => cb(shop, objectId);
    ipcRenderer.on("on-extraction-failed", listener);
    return () => ipcRenderer.removeListener("on-extraction-failed", listener);
  },
  onArchiveDeletionPrompt: (cb: (archivePaths: string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, archivePaths: string[]) => cb(archivePaths);
    ipcRenderer.on("on-archive-deletion-prompt", listener);
    return () => ipcRenderer.removeListener("on-archive-deletion-prompt", listener);
  },
  deleteArchive: (filePath: string) => ipcRenderer.invoke("deleteArchive", filePath),
  repairGame: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("repairGame", shop, objectId),
};
