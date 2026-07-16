// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { backupAPI } from "./backup";
import { homeAPI } from "./home";
import { gamesAPI } from "./games";
import { catalogueAPI } from "./catalogue";
import { supplementalAPI } from "./supplemental";

import type {
  GameShop,
  DownloadProgress,
  UserPreferences,
  AppUpdaterEvent,
  StartGameDownloadPayload,
  GameRunning,
  FriendRequestAction,
  UpdateProfileRequest,
  SeedingStatus,
  Theme,
  FriendRequestSync,
  NotificationSync,
  ShortcutLocation,
  CreateSteamShortcutOptions,
  ProtonVersion,
  TorrentFilesResponse,
} from "@types";
import type { AuthPage } from "@shared";
import type { AxiosProgressEvent } from "axios";

contextBridge.exposeInMainWorld("electron", {
  /* Torrenting */
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
  ) =>
    ipcRenderer.invoke(
      "updateDownloadQueuePosition",
      shop,
      objectId,
      direction
    ),

  onDownloadProgress: (cb: (value: DownloadProgress | null) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: DownloadProgress | null
    ) => cb(value);
    ipcRenderer.on("on-download-progress", listener);
    return () => ipcRenderer.removeListener("on-download-progress", listener);
  },
  onProtonDownloadProgress: (
    cb: (
      value: {
        toolId: string;
        version: string;
        percent: number;
        speed: string;
      } | null
    ) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: {
        toolId: string;
        version: string;
        percent: number;
        speed: string;
      } | null
    ) => cb(value);
    ipcRenderer.on("on-proton-download-progress", listener);
    return () =>
      ipcRenderer.removeListener("on-proton-download-progress", listener);
  },
  onInstallProgress: (
    cb: (value: any) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: any
    ) => cb(value);
    ipcRenderer.on("mod-install-progress", listener);
    return () => ipcRenderer.removeListener("mod-install-progress", listener);
  },
  onInstallLog: (cb: (line: string) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      line: string
    ) => cb(line);
    ipcRenderer.on("on-install-log", listener);
    return () => ipcRenderer.removeListener("on-install-log", listener);
  },
  setGameExecutablePath: (
    shop: GameShop,
    objectId: string,
    executablePath: string
  ): Promise<void> => ipcRenderer.invoke("setGameExecutablePath", shop, objectId, executablePath),
  openExeFilePicker: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke("openExeFilePicker", defaultPath),
  onHardDelete: (cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("on-hard-delete", listener);
    return () => ipcRenderer.removeListener("on-hard-delete", listener);
  },
  onSeedingStatus: (cb: (value: SeedingStatus[]) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: SeedingStatus[]
    ) => cb(value);
    ipcRenderer.on("on-seeding-status", listener);
    return () => ipcRenderer.removeListener("on-seeding-status", listener);
  },
  checkDebridAvailability: (magnets: string[]) =>
    ipcRenderer.invoke("checkDebridAvailability", magnets),
  getTorrentFiles: (magnet: string) =>
    ipcRenderer.invoke("getTorrentFiles", magnet) as Promise<
      { ok: true; data: TorrentFilesResponse } | { ok: false; error: string }
    >,

  /* Catalogue */
  getGameShopDetails: (objectId: string, shop: GameShop, language: string) =>
    ipcRenderer.invoke("getGameShopDetails", objectId, shop, language),
  getRandomGame: () => ipcRenderer.invoke("getRandomGame"),
  getLocalResource: (filename: string) =>
    ipcRenderer.invoke("getLocalResource", filename),
  getGameStats: (objectId: string, shop: GameShop) =>
    ipcRenderer.invoke("getGameStats", objectId, shop),
  getGameAssets: (objectId: string, shop: GameShop) =>
    ipcRenderer.invoke("getGameAssets", objectId, shop),

  /* User preferences */
  getUserPreferences: () => ipcRenderer.invoke("getUserPreferences"),
  updateUserPreferences: (preferences: UserPreferences) =>
    ipcRenderer.invoke("updateUserPreferences", preferences),
  autoLaunch: (autoLaunchProps: { enabled: boolean; minimized: boolean }) =>
    ipcRenderer.invoke("autoLaunch", autoLaunchProps),
  /* Download sources */
  addDownloadSource: (url: string) =>
    ipcRenderer.invoke("addDownloadSource", url),
  removeDownloadSource: (url: string, removeAll?: boolean) =>
    ipcRenderer.invoke("removeDownloadSource", url, removeAll),
  getDownloadSources: () => ipcRenderer.invoke("getDownloadSources"),
  syncDownloadSources: () => ipcRenderer.invoke("syncDownloadSources"),
  getDownloadSourcesCheckBaseline: () =>
    ipcRenderer.invoke("getDownloadSourcesCheckBaseline"),
  getDownloadSourcesSinceValue: () =>
    ipcRenderer.invoke("getDownloadSourcesSinceValue"),

  /* Library */
  toggleAutomaticCloudSync: (
    shop: GameShop,
    objectId: string,
    automaticCloudSync: boolean
  ) =>
    ipcRenderer.invoke(
      "toggleAutomaticCloudSync",
      shop,
      objectId,
      automaticCloudSync
    ),
  toggleGameMangohud: (
    shop: GameShop,
    objectId: string,
    autoRunMangohud: boolean
  ) =>
    ipcRenderer.invoke("toggleGameMangohud", shop, objectId, autoRunMangohud),
  toggleGameGamemode: (
    shop: GameShop,
    objectId: string,
    autoRunGamemode: boolean
  ) =>
    ipcRenderer.invoke("toggleGameGamemode", shop, objectId, autoRunGamemode),
  isGamemodeAvailable: () => ipcRenderer.invoke("isGamemodeAvailable"),
  isMangohudAvailable: () => ipcRenderer.invoke("isMangohudAvailable"),
  isWinetricksAvailable: () => ipcRenderer.invoke("isWinetricksAvailable"),
  addGameToLibrary: (shop: GameShop, objectId: string, title: string) =>
    ipcRenderer.invoke("addGameToLibrary", shop, objectId, title),
  addCustomGameToLibrary: (
    title: string,
    executablePath: string,
    iconUrl?: string,
    logoImageUrl?: string,
    libraryHeroImageUrl?: string,
    runner?: string,
    protonVersion?: string,
    protonPath?: string,
    prefix?: string
  ) =>
    ipcRenderer.invoke(
      "addCustomGameToLibrary",
      title,
      executablePath,
      iconUrl,
      logoImageUrl,
      libraryHeroImageUrl,
      runner,
      protonVersion,
      protonPath,
      prefix
    ),
  updateGameConfig: (
    shop: GameShop,
    objectId: string,
    config: {
      prefix?: string;
      winePrefixPath?: string;
      protonVersion?: string;
      protonPath?: string;
      wineVersion?: string;
      gameArgs?: string;
      launchOptions?: string;
      prelaunchCommand?: string;
      postexitCommand?: string;
      env?: Record<string, string>;
      mangoHud?: boolean;
      autoRunMangohud?: boolean;
      gameMode?: boolean;
      autoRunGamemode?: boolean;
      dxvk?: boolean;
      esync?: boolean;
      fsync?: boolean;
      protonAddons?: string[];
      containerCommand?: string;
      resolution?: string;
      fpsLimit?: string;
      vsync?: string;
      renderingMode?: string;
      videoDriver?: string;
      dxvkVersion?: string;
      vulkan?: boolean;
      frameThrottle?: string;
      audioDriver?: string;
      audioChannels?: string;
      audioSampleRate?: string;
      audioInBackground?: boolean;
      threadedD3D?: boolean;
      preferSystemLibs?: boolean;
      dllOverrides?: string;
      dlls?: string[];
      winetricks?: string;
      language?: string;
      locale?: string;
      vkd3d?: boolean;
      textures?: boolean;
      dxvkAsync?: boolean;
      amdFsr?: boolean;
      amdFsrSharpness?: string;
      fluidResolution?: boolean;
      superResolution?: boolean;
      esyncManual?: boolean;
      fsyncManual?: boolean;
      enableEac?: boolean;
      enableBattlEye?: boolean;
      vkd3dVersion?: string;
      d3dExtras?: boolean;
      d3dExtrasVersion?: string;
      virtualDesktop?: boolean;
      wineDesktop?: string;
      dpiScaling?: boolean;
      explicitDpi?: string;
      mouseWarpOverride?: string;
      graphicsBackend?: string;
      isDeleted?: boolean;
    }
  ) => ipcRenderer.invoke("updateGameConfig", shop, objectId, config),
  copyCustomGameAsset: (
    sourcePath: string,
    assetType: "icon" | "logo" | "hero"
  ) => ipcRenderer.invoke("copyCustomGameAsset", sourcePath, assetType),
  saveTempFile: (fileName: string, fileData: Uint8Array) =>
    ipcRenderer.invoke("saveTempFile", fileName, fileData),
  deleteTempFile: (filePath: string) =>
    ipcRenderer.invoke("deleteTempFile", filePath),
  cleanupUnusedAssets: () => ipcRenderer.invoke("cleanupUnusedAssets"),
  updateCustomGame: (params: {
    shop: GameShop;
    objectId: string;
    title: string;
    iconUrl?: string;
    logoImageUrl?: string;
    libraryHeroImageUrl?: string;
    originalIconPath?: string;
    originalLogoPath?: string;
    originalHeroPath?: string;
  }) => ipcRenderer.invoke("updateCustomGame", params),
  updateGameCustomAssets: (params: {
    shop: GameShop;
    objectId: string;
    title: string;
    customIconUrl?: string | null;
    customLogoImageUrl?: string | null;
    customHeroImageUrl?: string | null;
    customOriginalIconPath?: string | null;
    customOriginalLogoPath?: string | null;
    customOriginalHeroPath?: string | null;
  }) => ipcRenderer.invoke("updateGameCustomAssets", params),
  createGameShortcut: (
    shop: GameShop,
    objectId: string,
    location: ShortcutLocation
  ) => ipcRenderer.invoke("createGameShortcut", shop, objectId, location),
  updateExecutablePath: (
    shop: GameShop,
    objectId: string,
    executablePath: string | null
  ) =>
    ipcRenderer.invoke("updateExecutablePath", shop, objectId, executablePath),
  addGameToFavorites: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("addGameToFavorites", shop, objectId),
  removeGameFromFavorites: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("removeGameFromFavorites", shop, objectId),
  assignGameToCollection: (
    shop: GameShop,
    objectId: string,
    collectionIds: string[]
  ) =>
    ipcRenderer.invoke("assignGameToCollection", shop, objectId, collectionIds),
  clearNewDownloadOptions: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("clearNewDownloadOptions", shop, objectId),
  toggleGamePin: (shop: GameShop, objectId: string, pinned: boolean) =>
    ipcRenderer.invoke("toggleGamePin", shop, objectId, pinned),
  updateLaunchOptions: (
    shop: GameShop,
    objectId: string,
    launchOptions: string | null
  ) => ipcRenderer.invoke("updateLaunchOptions", shop, objectId, launchOptions),

  selectGameWinePrefix: (
    shop: GameShop,
    objectId: string,
    winePrefixPath: string | null
  ) =>
    ipcRenderer.invoke("selectGameWinePrefix", shop, objectId, winePrefixPath),
  selectGameProtonPath: (
    shop: GameShop,
    objectId: string,
    protonPath: string | null
  ) => ipcRenderer.invoke("selectGameProtonPath", shop, objectId, protonPath),
  getInstalledProtonVersions: () =>
    ipcRenderer.invoke("getInstalledProtonVersions") as Promise<
      ProtonVersion[]
    >,
  recommendProton: (gameId: string) =>
    ipcRenderer.invoke("recommendProton", gameId),
  getForkCatalog: () =>
    ipcRenderer.invoke("getForkCatalog"),
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
  installLibrary: (shop: GameShop, objectId: string, libraryId: string) =>
    ipcRenderer.invoke("installLibrary", shop, objectId, libraryId),
  onLibraryInstallProgress: (
    cb: (data: { libraryId: string; phase: string }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { libraryId: string; phase: string }
    ) => cb(data);
    ipcRenderer.on("library-install-progress", listener);
    return () => ipcRenderer.removeListener("library-install-progress", listener);
  },
  checkX11Support: () =>
    ipcRenderer.invoke("checkX11Support"),
  installX11Support: () =>
    ipcRenderer.invoke("installX11Support"),
  openGameExecutablePath: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("openGameExecutablePath", shop, objectId),
  openGameWinePrefix: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("openGameWinePrefix", shop, objectId),
  getGameSaveFolder: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("getGameSaveFolder", shop, objectId),
  openGameSaveFolder: (
    shop: GameShop,
    objectId: string,
    saveFolderPath: string
  ) => ipcRenderer.invoke("openGameSaveFolder", shop, objectId, saveFolderPath),
  openGame: (
    shop: GameShop,
    objectId: string,
    executablePath: string,
    launchOptions?: string | null
  ) =>
    ipcRenderer.invoke(
      "openGame",
      shop,
      objectId,
      executablePath,
      launchOptions
    ),
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
  downloadGameCovers: (
    steamAppId: string,
    objectId: string,
    gameTitle: string
  ) =>
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
  createSteamShortcut: (
    shop: GameShop,
    objectId: string,
    options?: CreateSteamShortcutOptions
  ) => ipcRenderer.invoke("createSteamShortcut", shop, objectId, options),
  deleteSteamShortcut: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("deleteSteamShortcut", shop, objectId),
  checkSteamShortcut: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("checkSteamShortcut", shop, objectId),
  onGamesRunning: (
    cb: (
      gamesRunning: Pick<GameRunning, "id" | "sessionDurationInMillis">[]
    ) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, gamesRunning) =>
      cb(gamesRunning);
    ipcRenderer.on("on-games-running", listener);
    return () => ipcRenderer.removeListener("on-games-running", listener);
  },
  onLibraryBatchComplete: (cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("on-library-batch-complete", listener);
    return () =>
      ipcRenderer.removeListener("on-library-batch-complete", listener);
  },
  onExtractionComplete: (cb: (shop: GameShop, objectId: string) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      shop: GameShop,
      objectId: string
    ) => cb(shop, objectId);
    ipcRenderer.on("on-extraction-complete", listener);
    return () => ipcRenderer.removeListener("on-extraction-complete", listener);
  },
  onExtractionProgress: (
    cb: (shop: GameShop, objectId: string, progress: number) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      shop: GameShop,
      objectId: string,
      progress: number
    ) => cb(shop, objectId, progress);
    ipcRenderer.on("on-extraction-progress", listener);
    return () => ipcRenderer.removeListener("on-extraction-progress", listener);
  },
  onExtractionFailed: (cb: (shop: GameShop, objectId: string) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      shop: GameShop,
      objectId: string
    ) => cb(shop, objectId);
    ipcRenderer.on("on-extraction-failed", listener);
    return () => ipcRenderer.removeListener("on-extraction-failed", listener);
  },
  onArchiveDeletionPrompt: (cb: (archivePaths: string[]) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      archivePaths: string[]
    ) => cb(archivePaths);
    ipcRenderer.on("on-archive-deletion-prompt", listener);
    return () =>
      ipcRenderer.removeListener("on-archive-deletion-prompt", listener);
  },
  deleteArchive: (filePath: string) =>
    ipcRenderer.invoke("deleteArchive", filePath),
  repairGame: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("repairGame", shop, objectId),

  /* Hardware */
  getDiskFreeSpace: (path: string) =>
    ipcRenderer.invoke("getDiskFreeSpace", path),
  checkFolderWritePermission: (path: string) =>
    ipcRenderer.invoke("checkFolderWritePermission", path),

  /* Cloud save */
  uploadSaveGame: (
    objectId: string,
    shop: GameShop,
    downloadOptionTitle: string | null
  ) =>
    ipcRenderer.invoke("uploadSaveGame", objectId, shop, downloadOptionTitle),
  downloadGameArtifact: (
    objectId: string,
    shop: GameShop,
    gameArtifactId: string
  ) =>
    ipcRenderer.invoke("downloadGameArtifact", objectId, shop, gameArtifactId),
  getGameArtifacts: (objectId: string, shop: GameShop) =>
    ipcRenderer.invoke("getGameArtifacts", objectId, shop),
  getGameBackupPreview: (objectId: string, shop: GameShop) =>
    ipcRenderer.invoke("getGameBackupPreview", objectId, shop),
  selectGameBackupPath: (
    shop: GameShop,
    objectId: string,
    backupPath: string | null
  ) => ipcRenderer.invoke("selectGameBackupPath", shop, objectId, backupPath),
  onUploadComplete: (objectId: string, shop: GameShop, cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on(`on-upload-complete-${objectId}-${shop}`, listener);
    return () =>
      ipcRenderer.removeListener(
        `on-upload-complete-${objectId}-${shop}`,
        listener
      );
  },
  onBackupDownloadProgress: (
    objectId: string,
    shop: GameShop,
    cb: (progress: AxiosProgressEvent) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: AxiosProgressEvent
    ) => cb(progress);
    ipcRenderer.on(`on-backup-download-progress-${objectId}-${shop}`, listener);
    return () =>
      ipcRenderer.removeListener(
        `on-backup-download-progress-${objectId}-${shop}`,
        listener
      );
  },
  onBackupDownloadComplete: (
    objectId: string,
    shop: GameShop,
    cb: () => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on(`on-backup-download-complete-${objectId}-${shop}`, listener);
    return () =>
      ipcRenderer.removeListener(
        `on-backup-download-complete-${objectId}-${shop}`,
        listener
      );
  },

  /* Misc */
  ping: () => ipcRenderer.invoke("ping"),
  getVersion: () => ipcRenderer.invoke("getVersion"),
  getDefaultDownloadsPath: () => ipcRenderer.invoke("getDefaultDownloadsPath"),
  getUserHomePath: () => ipcRenderer.invoke("getUserHomePath"),
  isStaging: () => ipcRenderer.invoke("isStaging"),
  isPortableVersion: () => ipcRenderer.invoke("isPortableVersion"),
  openExternal: (src: string) => ipcRenderer.invoke("openExternal", src),
  getSiteUrl: () => ipcRenderer.invoke("getSiteUrl"),
  openCheckout: () => ipcRenderer.invoke("openCheckout"),
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke("showOpenDialog", options),
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke("showItemInFolder", path),
  getImageDataUrl: (imageUrl: string) =>
    ipcRenderer.invoke("getImageDataUrl", imageUrl),
  forgerApi: {
    get: (
      url: string,
      options?: {
        params?: unknown;
        needsAuth?: boolean;
        needsSubscription?: boolean;
        ifModifiedSince?: Date;
      }
    ) =>
      ipcRenderer.invoke("forgerApiCall", {
        method: "get",
        url,
        params: options?.params,
        options: {
          needsAuth: options?.needsAuth,
          needsSubscription: options?.needsSubscription,
          ifModifiedSince: options?.ifModifiedSince,
        },
      }),
    post: (
      url: string,
      options?: {
        data?: unknown;
        needsAuth?: boolean;
        needsSubscription?: boolean;
      }
    ) =>
      ipcRenderer.invoke("forgerApiCall", {
        method: "post",
        url,
        data: options?.data,
        options: {
          needsAuth: options?.needsAuth,
          needsSubscription: options?.needsSubscription,
        },
      }),
    put: (
      url: string,
      options?: {
        data?: unknown;
        needsAuth?: boolean;
        needsSubscription?: boolean;
      }
    ) =>
      ipcRenderer.invoke("forgerApiCall", {
        method: "put",
        url,
        data: options?.data,
        options: {
          needsAuth: options?.needsAuth,
          needsSubscription: options?.needsSubscription,
        },
      }),
    patch: (
      url: string,
      options?: {
        data?: unknown;
        needsAuth?: boolean;
        needsSubscription?: boolean;
      }
    ) =>
      ipcRenderer.invoke("forgerApiCall", {
        method: "patch",
        url,
        data: options?.data,
        options: {
          needsAuth: options?.needsAuth,
          needsSubscription: options?.needsSubscription,
        },
      }),
    delete: (
      url: string,
      options?: {
        needsAuth?: boolean;
        needsSubscription?: boolean;
      }
    ) =>
      ipcRenderer.invoke("forgerApiCall", {
        method: "delete",
        url,
        options: {
          needsAuth: options?.needsAuth,
          needsSubscription: options?.needsSubscription,
        },
      }),
  },
  canInstallCommonRedist: () => ipcRenderer.invoke("canInstallCommonRedist"),
  installCommonRedist: () => ipcRenderer.invoke("installCommonRedist"),
  installForgerDeckyPlugin: () => ipcRenderer.invoke("installForgerDeckyPlugin"),
  getForgerDeckyPluginInfo: () => ipcRenderer.invoke("getForgerDeckyPluginInfo"),
  checkHomebrewFolderExists: () =>
    ipcRenderer.invoke("checkHomebrewFolderExists"),
  platform: process.platform,

  /* Auto update */
  onAutoUpdaterEvent: (cb: (value: AppUpdaterEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: AppUpdaterEvent
    ) => cb(value);

    ipcRenderer.on("autoUpdaterEvent", listener);

    return () => {
      ipcRenderer.removeListener("autoUpdaterEvent", listener);
    };
  },
  onCommonRedistProgress: (
    cb: (value: { log: string; complete: boolean }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { log: string; complete: boolean }
    ) => cb(value);
    ipcRenderer.on("common-redist-progress", listener);
    return () => ipcRenderer.removeListener("common-redist-progress", listener);
  },
  onPreflightProgress: (
    cb: (value: { status: string; detail: string | null }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { status: string; detail: string | null }
    ) => cb(value);
    ipcRenderer.on("preflight-progress", listener);
    return () => ipcRenderer.removeListener("preflight-progress", listener);
  },
  resetCommonRedistPreflight: () =>
    ipcRenderer.invoke("resetCommonRedistPreflight"),
  checkForUpdates: () => ipcRenderer.invoke("checkForUpdates"),
  restartAndInstallUpdate: () => ipcRenderer.invoke("restartAndInstallUpdate"),

  // Executable selection
  getPendingExecutableSelection: () => ipcRenderer.invoke("getPendingExecutableSelection"),
  confirmExecutableSelection: (shop: string, objectId: string, executablePath: string) =>
    ipcRenderer.invoke("confirmExecutableSelection", shop, objectId, executablePath),
  cancelExecutableSelection: () => ipcRenderer.invoke("cancelExecutableSelection"),
  onSelectExecutable: (
    cb: (value: { candidates: { path: string; name: string; size: number }[]; suggestedDir: string | null; prefixDriveCPath: string; shop: string; objectId: string }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, value: any) => cb(value);
    ipcRenderer.on("select-executable", listener);
    return () => ipcRenderer.removeListener("select-executable", listener);
  },
  onGameExecutableUpdated: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-game-executable-updated", listener);
    return () => ipcRenderer.removeListener("on-game-executable-updated", listener);
  },
  selectExecutable: (shop: string, objectId: string, path: string) =>
    ipcRenderer.invoke("selectExecutable", shop, objectId, path),
  getGameLogLines: (shop: string, objectId: string) =>
    ipcRenderer.invoke("getGameLogLines", shop, objectId),
  clearGameLog: (shop: string, objectId: string) =>
    ipcRenderer.invoke("clearGameLog", shop, objectId),
  onGameLogLine: (cb: (data: { shop: string; objectId: string; lines: string[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { shop: string; objectId: string; lines: string[] }) => cb(data);
    ipcRenderer.on("on-game-log-line", handler);
    return () => ipcRenderer.removeListener("on-game-log-line", handler);
  },
  onOpenGameLog: (cb: (data: { shop: string; objectId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, shop: string, objectId: string) => cb({ shop, objectId });
    ipcRenderer.on("open-game-log", handler);
    return () => ipcRenderer.removeListener("open-game-log", handler);
  },

  /* Profile */
  getMe: () => ipcRenderer.invoke("getMe"),
  updateProfile: (updateProfile: UpdateProfileRequest) =>
    ipcRenderer.invoke("updateProfile", updateProfile),
  processProfileImage: (imagePath: string) =>
    ipcRenderer.invoke("processProfileImage", imagePath),
  onSyncFriendRequests: (cb: (friendRequests: FriendRequestSync) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      friendRequests: FriendRequestSync
    ) => cb(friendRequests);
    ipcRenderer.on("on-sync-friend-requests", listener);
    return () =>
      ipcRenderer.removeListener("on-sync-friend-requests", listener);
  },
  onSyncNotificationCount: (cb: (notification: NotificationSync) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      notification: NotificationSync
    ) => cb(notification);
    ipcRenderer.on("on-sync-notification-count", listener);
    return () =>
      ipcRenderer.removeListener("on-sync-notification-count", listener);
  },
  updateFriendRequest: (userId: string, action: FriendRequestAction) =>
    ipcRenderer.invoke("updateFriendRequest", userId, action),

  /* Auth */
  getAuth: () => ipcRenderer.invoke("getAuth"),
  signOut: () => ipcRenderer.invoke("signOut"),
  openAuthWindow: (page: AuthPage) =>
    ipcRenderer.invoke("openAuthWindow", page),
  getSessionHash: () => ipcRenderer.invoke("getSessionHash"),
  onSignIn: (cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("on-signin", listener);
    return () => ipcRenderer.removeListener("on-signin", listener);
  },
  onAccountUpdated: (cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("on-account-updated", listener);
    return () => ipcRenderer.removeListener("on-account-updated", listener);
  },
  onSignOut: (cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("on-signout", listener);
    return () => ipcRenderer.removeListener("on-signout", listener);
  },

  /* Makai Auth (site2) */
  authLogin: (email: string, password: string) =>
    ipcRenderer.invoke("authLogin", email, password),
  authRegister: (username: string, email: string, password: string) =>
    ipcRenderer.invoke("authRegister", username, email, password),
  authLogout: () => ipcRenderer.invoke("authLogout"),
  getMakaiAuth: () => ipcRenderer.invoke("getMakaiAuth"),

  /* Makai Profile */
  getMakaiProfile: () => ipcRenderer.invoke("getMakaiProfile"),
  getAchievementIconUrl: (iconPath: string) => ipcRenderer.invoke("getAchievementIconUrl", iconPath),

  /* Makai Notifications */
  getNotifications: () => ipcRenderer.invoke("getNotifications"),
  getUnreadNotificationsCount: () => ipcRenderer.invoke("getUnreadNotificationsCount"),
  markNotificationsRead: (ids: number[]) =>
    ipcRenderer.invoke("markNotificationsRead", ids),

  /* Notifications */
  publishNewRepacksNotification: (newRepacksCount: number) =>
    ipcRenderer.invoke("publishNewRepacksNotification", newRepacksCount),
  getLocalNotifications: () => ipcRenderer.invoke("getLocalNotifications"),
  getLocalNotificationsCount: () =>
    ipcRenderer.invoke("getLocalNotificationsCount"),
  markLocalNotificationRead: (id: string) =>
    ipcRenderer.invoke("markLocalNotificationRead", id),
  markAllLocalNotificationsRead: () =>
    ipcRenderer.invoke("markAllLocalNotificationsRead"),
  deleteLocalNotification: (id: string) =>
    ipcRenderer.invoke("deleteLocalNotification", id),
  clearAllLocalNotifications: () =>
    ipcRenderer.invoke("clearAllLocalNotifications"),
  onLocalNotificationCreated: (cb: (notification: unknown) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      notification: unknown
    ) => cb(notification);
    ipcRenderer.on("on-local-notification-created", listener);
    return () =>
      ipcRenderer.removeListener("on-local-notification-created", listener);
  },

  /* Themes */
  addCustomTheme: (theme: Theme) => ipcRenderer.invoke("addCustomTheme", theme),
  getAllCustomThemes: () => ipcRenderer.invoke("getAllCustomThemes"),
  deleteAllCustomThemes: () => ipcRenderer.invoke("deleteAllCustomThemes"),
  deleteCustomTheme: (themeId: string) =>
    ipcRenderer.invoke("deleteCustomTheme", themeId),
  updateCustomTheme: (themeId: string, code: string) =>
    ipcRenderer.invoke("updateCustomTheme", themeId, code),
  getCustomThemeById: (themeId: string) =>
    ipcRenderer.invoke("getCustomThemeById", themeId),
  getActiveCustomTheme: () => ipcRenderer.invoke("getActiveCustomTheme"),
  toggleCustomTheme: (themeId: string, isActive: boolean) =>
    ipcRenderer.invoke("toggleCustomTheme", themeId, isActive),
  getThemeSoundPath: (themeId: string) =>
    ipcRenderer.invoke("getThemeSoundPath", themeId),
  getThemeSoundDataUrl: (themeId: string) =>
    ipcRenderer.invoke("getThemeSoundDataUrl", themeId),
  importThemeSoundFromStore: (
    themeId: string,
    themeName: string,
    storeUrl: string
  ) =>
    ipcRenderer.invoke(
      "importThemeSoundFromStore",
      themeId,
      themeName,
      storeUrl
    ),
  importMakaiTheme: (fileArg?: string | ArrayBuffer | Uint8Array) =>
    ipcRenderer.invoke("importMakaiTheme", fileArg),
  extractThemeAssets: (fileBuffer: ArrayBuffer | Uint8Array, theme: Theme) =>
    ipcRenderer.invoke("extractThemeAssets", fileBuffer, theme),
  getThemeAssetPath: (themeId: string, assetType: "background" | "sidebarBg" | "sound" | "screenshot") =>
    ipcRenderer.invoke("getThemeAssetPath", themeId, assetType),
  migrateThemesToV3: () =>
    ipcRenderer.invoke("migrateThemesToV3"),

  /* Editor */
  openEditorWindow: (themeId: string) =>
    ipcRenderer.invoke("openEditorWindow", themeId),
  onCustomThemeUpdated: (cb: () => void) => {
    const listener = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("on-custom-theme-updated", listener);
    return () =>
      ipcRenderer.removeListener("on-custom-theme-updated", listener);
  },
  onNewDownloadOptions: (
    cb: (gamesWithNewOptions: { gameId: string; count: number }[]) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      gamesWithNewOptions: { gameId: string; count: number }[]
    ) => cb(gamesWithNewOptions);
    ipcRenderer.on("on-new-download-options", listener);
    return () =>
      ipcRenderer.removeListener("on-new-download-options", listener);
  },
  closeEditorWindow: (themeId?: string) =>
    ipcRenderer.invoke("closeEditorWindow", themeId),

  /* Game Launcher Window */
  showGameLauncherWindow: () => ipcRenderer.invoke("showGameLauncherWindow"),
  closeGameLauncherWindow: () => ipcRenderer.invoke("closeGameLauncherWindow"),
  openMainWindow: () => ipcRenderer.invoke("openMainWindow"),
  isMainWindowOpen: () => ipcRenderer.invoke("isMainWindowOpen"),

  /* Store Generic CRUD */
  store: {
    get: (
      key: string,
      sublevelName?: string | null,
      valueEncoding?: "json" | "utf8"
    ) => ipcRenderer.invoke("storeGet", key, sublevelName, valueEncoding),
    put: (
      key: string,
      value: unknown,
      sublevelName?: string | null,
      valueEncoding?: "json" | "utf8"
    ) =>
      ipcRenderer.invoke("storePut", key, value, sublevelName, valueEncoding),
    del: (key: string, sublevelName?: string | null) =>
      ipcRenderer.invoke("storeDel", key, sublevelName),
    clear: (sublevelName: string) =>
      ipcRenderer.invoke("storeClear", sublevelName),
    values: (sublevelName: string) =>
      ipcRenderer.invoke("storeValues", sublevelName),
    iterator: (sublevelName: string) =>
      ipcRenderer.invoke("storeIterator", sublevelName),
  },

  /* Mods Store (separate database) */
  modsStore: {
    get: (key: string) => ipcRenderer.invoke("modsStoreGet", key),
    put: (key: string, value: unknown) => ipcRenderer.invoke("modsStorePut", key, value),
    del: (key: string) => ipcRenderer.invoke("modsStoreDel", key),
  },

  //UPDATEDD
  pauseGameTransfer: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("pauseGameTransfer", shop, objectId),
  resumeGameTransfer: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("resumeGameTransfer", shop, objectId),
  cancelGameTransfer: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("cancelGameTransfer", shop, objectId),

  // Add these to the electron object in contextBridge.exposeInMainWorld
  on: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  off: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.off(channel, listener);
  },
  getAvailableDrives: () => ipcRenderer.invoke("getAvailableDrives"),
  transferGameFiles: (shop: GameShop, objectId: string, destParent: string) =>
    ipcRenderer.invoke("transferGameFiles", shop, objectId, destParent),
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

  // Proton Manager
  getProtonTools: () => ipcRenderer.invoke("getProtonTools"),
  getProtonToolsByCategory: (category: string) =>
    ipcRenderer.invoke("getProtonToolsByCategory", category),
  getProtonReleases: (toolId: string) =>
    ipcRenderer.invoke("getProtonReleases", toolId),
  translateText: (text: string, targetLang: string) =>
    ipcRenderer.invoke("translateText", text, targetLang),
  downloadProtonTool: (
    toolId: string,
    release: {
      tag_name: string;
      assets: { name: string; browser_download_url: string }[];
    }
  ) => ipcRenderer.invoke("downloadProtonTool", toolId, release),
  downloadProton: (fork: {
    fork: string;
    name: string;
    version: string;
    tier: string;
    tierScore: number;
    confidence: string;
    note?: string;
  }) => ipcRenderer.invoke("downloadProton", fork),
  analyzeGameExe: (exePath: string) =>
    ipcRenderer.invoke("analyzeGameExe", exePath),
  getInstalledProtonTools: () => ipcRenderer.invoke("getInstalledProtonTools"),
  getProtonInstallDir: () => ipcRenderer.invoke("getProtonInstallDir"),
  removeProtonTool: (toolId: string, version: string) =>
    ipcRenderer.invoke("removeProtonTool", toolId, version),

  // Steam
  ...gamesAPI,

  // Backup
  ...backupAPI,

  // Home
  ...homeAPI,

  // Catalogue extras
  ...catalogueAPI,

  // Supplemental
  ...supplementalAPI,

  // Mod Manager
  detectConflicts: (gameId: string, enabledMods: { name: string; priority: number }[]) =>
    ipcRenderer.invoke("detectConflicts", gameId, enabledMods),

  preparePrefix: (gameName: string) =>
    ipcRenderer.invoke("preparePrefix", gameName),

  getGameProtonInfo: (gameName: string) =>
    ipcRenderer.invoke("getGameProtonInfo", gameName),

  setupProtonEnvironment: (gameName: string, protonPath: string, prefixPath: string, clean?: boolean) =>
    ipcRenderer.invoke("setupProtonEnvironment", gameName, protonPath, prefixPath, clean),

  onProtonInfoProgress: (cb: (progress: { step: string; status: string }) => void) => {
    const listener = (_event: any, progress: { step: string; status: string }) => cb(progress);
    ipcRenderer.on("proton-info-progress", listener);
    return () => ipcRenderer.removeListener("proton-info-progress", listener);
  },

  onProtonSetupLog: (cb: (line: string) => void) => {
    const listener = (_event: any, line: string) => cb(line);
    ipcRenderer.on("proton-setup-log", listener);
    return () => ipcRenderer.removeListener("proton-setup-log", listener);
  },
  onPrefixProgress: (cb: (appId: string, msg: string) => void) => {
    const listener = (_event: any, appId: string, msg: string) => cb(appId, msg);
    ipcRenderer.on("prefix-progress", listener);
    return () => ipcRenderer.removeListener("prefix-progress", listener);
  },

  eslify: (pluginPath: string, dryRun?: boolean, safeCheck?: boolean) =>
    ipcRenderer.invoke("eslify", pluginPath, dryRun, safeCheck),
  bsaInvalidate: (gamePath: string, gameId: string, enable: boolean) =>
    ipcRenderer.invoke("bsaInvalidate", gamePath, gameId, enable),
  parseFomod: (stagingDir: string) =>
    ipcRenderer.invoke("parseFomod", stagingDir),

  installFomod: (stagingDir: string, targetDir: string, selections: Record<string, string[]>) =>
    ipcRenderer.invoke("installFomod", stagingDir, targetDir, selections),

  installFomodWithComponents: (stagingDir: string, targetDir: string, selections: Record<string, string[]>) =>
    ipcRenderer.invoke("installFomodWithComponents", stagingDir, targetDir, selections),

  toggleFomodComponent: (stagingDir: string, files: string[], enable: boolean, sourceFiles?: { source: string; destination: string }[]) =>
    ipcRenderer.invoke("toggleFomodComponent", stagingDir, files, enable, sourceFiles),

  captureFomodComponents: (stagingDir: string) =>
    ipcRenderer.invoke("captureFomodComponents", stagingDir),

  deployMods: (gameId: string, profile: string) =>
    ipcRenderer.invoke("deployMods", gameId, profile),
  checkModExists: (archivePath: string, gameId: string, profile?: string) =>
    ipcRenderer.invoke("checkModExists", archivePath, gameId, profile),
  installModOrchestrated: (archivePath: string, config: any) =>
    ipcRenderer.invoke("installModOrchestrated", archivePath, config),
  abortInstall: () =>
    ipcRenderer.invoke("abortInstall"),
  verifyGameReady: (gameId: string) =>
    ipcRenderer.invoke("verifyGameReady", gameId),
  scanEnvironment: (gameId: string, autoFix?: boolean) =>
    ipcRenderer.invoke("scanEnvironment", gameId, autoFix),
  onModInstallProgress: (cb: (data: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("mod-install-progress", listener);
    return () => ipcRenderer.removeListener("mod-install-progress", listener);
  },
  modLoadOrderSort: (gameId: string, plugins: { filename: string; masters?: string[] }[]) =>
    ipcRenderer.invoke("modLoadOrderSort", gameId, plugins),
  modValidateLoadOrder: (gameId: string, plugins: { filename: string; masters?: string[] }[]) =>
    ipcRenderer.invoke("modValidateLoadOrder", gameId, plugins),
  listModFiles: (stagingDir: string) =>
    ipcRenderer.invoke("listModFiles", stagingDir),
  listIniFiles: (profileDir: string) =>
    ipcRenderer.invoke("listIniFiles", profileDir),
  listDataFolder: (gamePath: string, gameId?: string) =>
    ipcRenderer.invoke("listDataFolder", gamePath, gameId),
  saveGameConfig: (gameName: string, config: any) =>
    ipcRenderer.invoke("saveGameConfig", gameName, config),
  getGameConfig: (gameName: string) =>
    ipcRenderer.invoke("getGameConfig", gameName),
  listGameConfigs: () =>
    ipcRenderer.invoke("listGameConfigs"),
  removeMod: (gameId: string, profile: string, modName: string) =>
    ipcRenderer.invoke("removeMod", gameId, profile, modName),
  modLaunchGame: (gameId: string) =>
    ipcRenderer.invoke("modLaunchGame", gameId),
  modPlayGame: (gameId: string, profile?: string) =>
    ipcRenderer.invoke("modPlayGame", gameId, profile),
  modKillGame: () =>
    ipcRenderer.invoke("modKillGame"),
  modScanFixGame: (gameId: string) =>
    ipcRenderer.invoke("modScanFixGame", gameId),
  onModLaunchProgress: (cb: (data: { step: string; message: string; status: string; promptType?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("mod-launch-progress", listener);
    return () => ipcRenderer.removeListener("mod-launch-progress", listener);
  },
  modRunWineTool: (gameId: string, tool: string) =>
    ipcRenderer.invoke("modRunWineTool", gameId, tool),
  getModGameInfo: (gameId: string) =>
    ipcRenderer.invoke("getModGameInfo", gameId),
  modDetectGamePath: (gameId: string) =>
    ipcRenderer.invoke("modDetectGamePath", gameId),
  deleteMod: (gameId: string, profile: string, modName: string) =>
    ipcRenderer.invoke("deleteMod", gameId, profile, modName),
  getExternalTools: (gameId: string) =>
    ipcRenderer.invoke("getExternalTools", gameId),
  saveExternalTool: (tool: { name: string; exePath: string; args: string; gameId: string; useProton: boolean }) =>
    ipcRenderer.invoke("saveExternalTool", tool),
  removeExternalTool: (name: string, gameId: string) =>
    ipcRenderer.invoke("removeExternalTool", name, gameId),
  launchExternalTool: (gameId: string, toolName: string) =>
    ipcRenderer.invoke("launchExternalTool", gameId, toolName),
  scanExternalTools: (gameId: string) =>
    ipcRenderer.invoke("scanExternalTools", gameId),
  installExternalTool: (gameId: string, toolName: string) =>
    ipcRenderer.invoke("installExternalTool", gameId, toolName),
  getGameModuleTools: (gameId: string) =>
    ipcRenderer.invoke("getGameModuleTools", gameId),
  modBridgeLog: (level: string, ...args: unknown[]) =>
    ipcRenderer.invoke("modBridgeLog", level, ...args),
  modBridgeListGames: () =>
    ipcRenderer.invoke("modBridgeListGames"),
  modListKnownGames: () =>
    ipcRenderer.invoke("modListKnownGames"),

  modBridgeDiscoverGames: () =>
    ipcRenderer.invoke("modBridgeDiscoverGames"),
  getGameDllCatalog: () =>
    ipcRenderer.invoke("getGameDllCatalog"),
  getGameDllInfo: (gameId: string) =>
    ipcRenderer.invoke("getGameDllInfo", gameId),
  detectGameManual: (gameId: string, selectedPath: string) =>
    ipcRenderer.invoke("detectGameManual", gameId, selectedPath),
  prefixHealthCheck: (gameId: string) =>
    ipcRenderer.invoke("prefixHealthCheck", gameId),
  prefixAutoFix: (gameId: string) =>
    ipcRenderer.invoke("prefixAutoFix", gameId),
  createModPrefix: (gameId: string) =>
    ipcRenderer.invoke("modCreatePrefix", gameId),
  switchProton: (gameId: string, protonPath: string) =>
    ipcRenderer.invoke("modSwitchProton", gameId, protonPath),
  installGameDlls: (gameId: string, extraVerbs?: string[]) =>
    ipcRenderer.invoke("modInstallGameDlls", gameId, extraVerbs),
  modBridgeSetContext: (ctx: { source: string; gameId: string; prefixPath: string; gamePath?: string }) =>
    ipcRenderer.invoke("modBridgeSetContext", ctx),
  modBridgeGetContext: () =>
    ipcRenderer.invoke("modBridgeGetContext"),
  modBridgeClearContext: () =>
    ipcRenderer.invoke("modBridgeClearContext"),
  bsaExtract: (archivePath: string, destDir: string, listOnly?: boolean) =>
    ipcRenderer.invoke("bsaExtract", archivePath, destDir, listOnly),
  ba2Extract: (archivePath: string, destDir: string, listOnly?: boolean) =>
    ipcRenderer.invoke("ba2Extract", archivePath, destDir, listOnly),
  archiveList: (archivePath: string) =>
    ipcRenderer.invoke("archiveList", archivePath),
  seCheck: (gameId: string, gamePath: string) =>
    ipcRenderer.invoke("seCheck", gameId, gamePath),
  seInstall: (gameId: string, gamePath: string) =>
    ipcRenderer.invoke("seInstall", gameId, gamePath),
  mo2Import: (modlistPath: string, stagingDir?: string) =>
    ipcRenderer.invoke("mo2Import", modlistPath, stagingDir),
  mo2Export: (entries: any[], outputPath: string) =>
    ipcRenderer.invoke("mo2Export", entries, outputPath),
  bainDetect: (archivePath: string) =>
    ipcRenderer.invoke("bainDetect", archivePath),
  bainInstall: (archivePath: string, stagingDir: string, selectedPackages: number[]) =>
    ipcRenderer.invoke("bainInstall", archivePath, stagingDir, selectedPackages),
  rescanStaging: (gameId: string, profileName: string) =>
    ipcRenderer.invoke("rescanStaging", gameId, profileName),
  readModFile: (filePath: string) =>
    ipcRenderer.invoke("readModFile", filePath),
  scanModFolder: (dirPath: string, scanType: "image" | "readme") =>
    ipcRenderer.invoke("scanModFolder", dirPath, scanType),
  checkModsMedia: (stagingDirs: string[]) =>
    ipcRenderer.invoke("checkModsMedia", stagingDirs),

  listBackups: (gameId: string, profile: string) =>
    ipcRenderer.invoke("listBackups", gameId, profile),
  createBackup: (gameId: string, profile: string) =>
    ipcRenderer.invoke("createBackup", gameId, profile),
  restoreBackup: (gameId: string, profile: string, backupDir: string) =>
    ipcRenderer.invoke("restoreBackup", gameId, profile, backupDir),
  setBackupKept: (backupDir: string, kept: boolean) =>
    ipcRenderer.invoke("setBackupKept", backupDir, kept),

  // Chrome Browser (CDP Mirror)
  chromeLaunch: () => ipcRenderer.invoke("chrome-launch"),
  chromeSetupAndLaunch: (mirrorId?: string) => ipcRenderer.invoke("chrome-setup-and-launch", mirrorId),
  chromeClose: () => ipcRenderer.invoke("chrome-close"),
  chromeNavigate: (tabId: string, url: string) =>
    ipcRenderer.invoke("chrome-navigate", tabId, url),
  chromeNewTab: (url?: string) =>
    ipcRenderer.invoke("chrome-new-tab", url),
  chromeCloseTab: (tabId: string) =>
    ipcRenderer.invoke("chrome-close-tab", tabId),
  chromeSwitchTab: (tabId: string) =>
    ipcRenderer.invoke("chrome-switch-tab", tabId),
  chromeGetTabs: () => ipcRenderer.invoke("chrome-get-tabs"),
  chromeGetActiveTab: () => ipcRenderer.invoke("chrome-get-active-tab"),
  chromeSetZoom: (tabId: string, factor: number) =>
    ipcRenderer.invoke("chrome-set-zoom", tabId, factor),
  chromeGetZoom: (tabId: string) =>
    ipcRenderer.invoke("chrome-get-zoom", tabId),
  chromeSetPageMuted: (tabId: string, muted: boolean) =>
    ipcRenderer.invoke("chrome-set-page-muted", tabId, muted),
  chromeIsPageMuted: (tabId: string) =>
    ipcRenderer.invoke("chrome-is-page-muted", tabId),
  chromeNavigateBack: (tabId: string) =>
    ipcRenderer.invoke("chrome-navigate-back", tabId),
  chromeNavigateForward: (tabId: string) =>
    ipcRenderer.invoke("chrome-navigate-forward", tabId),
  chromeGetNavHistory: (tabId: string) =>
    ipcRenderer.invoke("chrome-get-nav-history", tabId),
  chromeOpenDevtools: (tabId: string) =>
    ipcRenderer.invoke("chrome-open-devtools", tabId),
  chromeGetBrowserStatus: () => ipcRenderer.invoke("chrome-get-browser-status"),

  chromeSendInput: (data: any) => ipcRenderer.send("chrome-user-input", data),
  chromeResizeViewport: (width: number, height: number) =>
    ipcRenderer.send("chrome-resize-viewport", { width, height }),

  onChromeSetupProgress: (cb: (progress: { status: string; detail?: string; progress: number; done?: boolean }) => void) => {
    const listener = (_event: any, progress: { status: string; detail?: string; progress: number; done?: boolean }) => cb(progress);
    ipcRenderer.on("chrome-setup-progress", listener);
    return () => ipcRenderer.removeListener("chrome-setup-progress", listener);
  },
  onChromeScreencastFrame: (cb: (frame: any) => void) => {
    const listener = (_event: any, frame: any) => {
      console.log("[preload] screencast frame received, tab:", frame.tabId, "data length:", frame.data?.length);
      cb(frame);
    };
    ipcRenderer.on("chrome-screencast-frame", listener);
    return () => ipcRenderer.removeListener("chrome-screencast-frame", listener);
  },
  onChromeTabList: (cb: (tabs: any[]) => void) => {
    const listener = (_event: any, tabs: any[]) => cb(tabs);
    ipcRenderer.on("chrome-tab-list", listener);
    return () => ipcRenderer.removeListener("chrome-tab-list", listener);
  },
  onChromeNavigation: (cb: (data: { tabId: string; url: string }) => void) => {
    const listener = (_event: any, data: { tabId: string; url: string }) => cb(data);
    ipcRenderer.on("chrome-navigation", listener);
    return () => ipcRenderer.removeListener("chrome-navigation", listener);
  },

  // Find in page
  chromeFindInPage: (tabId: string, query: string, forward: boolean) =>
    ipcRenderer.invoke("chrome-find-in-page", tabId, query, forward),
  chromeCountMatches: (tabId: string, query: string) =>
    ipcRenderer.invoke("chrome-count-matches", tabId, query),
  chromeClearFind: (tabId: string) =>
    ipcRenderer.invoke("chrome-clear-find", tabId),

  // Bookmarks
  chromeGetBookmarks: () =>
    ipcRenderer.invoke("chrome-get-bookmarks"),
  chromeAddBookmark: (url: string, title: string) =>
    ipcRenderer.invoke("chrome-add-bookmark", url, title),
  chromeRemoveBookmark: (url: string) =>
    ipcRenderer.invoke("chrome-remove-bookmark", url),
  onChromeBookmarksChanged: (cb: (bookmarks: Array<{ url: string; title: string }>) => void) => {
    const listener = (_event: any, bookmarks: Array<{ url: string; title: string }>) => cb(bookmarks);
    ipcRenderer.on("chrome-bookmarks-changed", listener);
    return () => ipcRenderer.removeListener("chrome-bookmarks-changed", listener);
  },

  // Extensions
  chromeGetExtensions: () =>
    ipcRenderer.invoke("chrome-get-extensions"),
  chromeGetExtensionState: () =>
    ipcRenderer.invoke("chrome-get-extension-state"),
  chromeToggleExtension: (enabled: boolean) =>
    ipcRenderer.invoke("chrome-toggle-extension", enabled),

  /* Runners */
  getRunners: () => ipcRenderer.invoke("getRunners"),
  getRunnerStatus: (runnerId: string) => ipcRenderer.invoke("getRunnerStatus", runnerId),
  getAllRunnersStatus: () => ipcRenderer.invoke("getAllRunnersStatus"),
  getRunnerIcon: (runnerId: string) => ipcRenderer.invoke("getRunnerIcon", runnerId),
  installRunner: (runnerId: string) => ipcRenderer.invoke("installRunner", runnerId),
  uninstallRunner: (runnerId: string) => ipcRenderer.invoke("uninstallRunner", runnerId),
  launchGame: (runnerId: string, romPath: string) => ipcRenderer.invoke("launchGame", runnerId, romPath),
  closeRunner: (runnerId: string) => ipcRenderer.invoke("closeRunner", runnerId),
  checkRunnerUpdates: (runnerId?: string) => ipcRenderer.invoke("checkRunnerUpdates", runnerId),
  shouldCheckRunnerUpdates: () => ipcRenderer.invoke("shouldCheckRunnerUpdates"),
  getRunnersWithUpdates: () => ipcRenderer.invoke("getRunnersWithUpdates"),
  onRunnerUpdatesAvailable: (cb: (updates: Array<{ runnerId: string; humanName: string; currentVersion: string; latestVersion: string }>) => void) => {
    const listener = (_event: any, updates: Array<{ runnerId: string; humanName: string; currentVersion: string; latestVersion: string }>) => cb(updates);
    ipcRenderer.on("on-runner-updates-available", listener);
    return () => ipcRenderer.removeListener("on-runner-updates-available", listener);
  },
  onRunnerStarted: (cb: (runnerId: string) => void) => {
    const listener = (_event: any, runnerId: string) => cb(runnerId);
    ipcRenderer.on("on-runner-started", listener);
    return () => ipcRenderer.removeListener("on-runner-started", listener);
  },
  onRunnerStopped: (cb: (runnerId: string) => void) => {
    const listener = (_event: any, runnerId: string) => cb(runnerId);
    ipcRenderer.on("on-runner-stopped", listener);
    return () => ipcRenderer.removeListener("on-runner-stopped", listener);
  },

  /* Scripts */
  getScriptsByGame: (shop: GameShop, objectId: string) =>
    ipcRenderer.invoke("getScriptsByGame", shop, objectId),
  getScriptById: (scriptId: string) =>
    ipcRenderer.invoke("getScriptById", scriptId),
  installScript: (scriptId: string) =>
    ipcRenderer.invoke("installScript", scriptId),
  toggleScriptLike: (scriptId: number) =>
    ipcRenderer.invoke("toggleScriptLike", scriptId),
  toggleScriptDislike: (scriptId: number) =>
    ipcRenderer.invoke("toggleScriptDislike", scriptId),
  getScriptComments: (scriptId: number) =>
    ipcRenderer.invoke("getScriptComments", scriptId),
  postScriptComment: (scriptId: number, body: string, parentId?: number) =>
    ipcRenderer.invoke("postScriptComment", scriptId, body, parentId),
  deleteScriptComment: (scriptId: number, commentId: number) =>
    ipcRenderer.invoke("deleteScriptComment", scriptId, commentId),
  toggleCommentLike: (scriptId: number, commentId: number) =>
    ipcRenderer.invoke("toggleCommentLike", scriptId, commentId),
  toggleCommentDislike: (scriptId: number, commentId: number) =>
    ipcRenderer.invoke("toggleCommentDislike", scriptId, commentId),
  deleteScript: (scriptId: number) =>
    ipcRenderer.invoke("deleteScript", scriptId),
  getUsers: () => ipcRenderer.invoke("getUsers"),
  banUser: (userId: number, duration: number, reason: string) =>
    ipcRenderer.invoke("banUser", userId, duration, reason),
});
