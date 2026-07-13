import type { AuthPage } from "@shared";
import type {
  AppUpdaterEvent,
  GameShop,
  Steam250Game,
  DownloadProgress,
  SeedingStatus,
  UserPreferences,
  StartGameDownloadPayload,
  UserProfile,
  FriendRequestAction,
  UpdateProfileRequest,
  UserDetails,
  FriendRequestSync,
  NotificationSync,
  GameArtifact,
  LudusaviBackup,
  LibraryGame,
  GameRunning,
  Theme,
  Auth,
  ShortcutLocation,
  ShopAssets,
  ShopDetailsWithAssets,
  Game,
  DiskUsage,
  DownloadSource,
  LocalNotification,
  ProtonVersion,
  ProtonRecommendation,
  CreateSteamShortcutOptions,
  TorrentFilesResponse,
  FomodConfig,
  PluginEntry,
  DeploymentResult,
  FileConflict,
} from "@types";
import type { AxiosProgressEvent } from "axios";

export interface DriveInfo {
  root: string;
  label: string;
  free: number;
  total: number;
}

export interface HealthReport {
  valid: boolean;
  prefixExists: boolean;
  prefixValid: boolean;
  dllOverridesOk: boolean;
  dllOverridesMissing: string[];
  seInstalled: boolean;
  seName: string;
  frameworks: { name: string; installed: boolean }[];
  depsInstalled: string[];
  depsMissing: string[];
  errors: string[];
}

export interface ExternalTool {
  name: string;
  exePath: string;
  args: string;
  gameId: string;
  useProton: boolean;
}

declare global {
  declare module "*.svg" {
    const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
    export default content;
  }

  interface Electron {
    /* Torrenting */
    startGameDownload: (
      payload: StartGameDownloadPayload
    ) => Promise<{ ok: boolean; error?: string }>;
    addGameToQueue: (
      payload: StartGameDownloadPayload
    ) => Promise<{ ok: boolean; error?: string }>;
    cancelGameDownload: (shop: GameShop, objectId: string) => Promise<void>;
    pauseGameDownload: (shop: GameShop, objectId: string) => Promise<void>;
    resumeGameDownload: (shop: GameShop, objectId: string) => Promise<void>;
    pauseGameSeed: (shop: GameShop, objectId: string) => Promise<void>;
    resumeGameSeed: (shop: GameShop, objectId: string) => Promise<void>;
    updateDownloadQueuePosition: (
      shop: GameShop,
      objectId: string,
      direction: "up" | "down"
    ) => Promise<boolean>;
    onDownloadProgress: (
      cb: (value: DownloadProgress | null) => void
    ) => () => Electron.IpcRenderer;
    onProtonDownloadProgress: (
      cb: (
        value: {
          toolId: string;
          version: string;
          percent: number;
          speed: string;
        } | null
      ) => void
    ) => () => Electron.IpcRenderer;
    onInstallProgress: (
      cb: (value: any) => void
    ) => () => Electron.IpcRenderer;
    onInstallLog: (
      cb: (line: string) => void
    ) => () => Electron.IpcRenderer;
    onSeedingStatus: (
      cb: (value: SeedingStatus[]) => void
    ) => () => Electron.IpcRenderer;
    onHardDelete: (cb: () => void) => () => Electron.IpcRenderer;
    checkDebridAvailability: (
      magnets: string[]
    ) => Promise<Record<string, boolean>>;
    getTorrentFiles: (
      magnet: string
    ) => Promise<
      { ok: true; data: TorrentFilesResponse } | { ok: false; error: string }
    >;
    ensureVenv: () => Promise<void>;
    onVenvProgress: (
      cb: (value: { status: string; percent: number } | null) => void
    ) => () => Electron.IpcRenderer;

    /* Catalogue */
    getGameShopDetails: (
      objectId: string,
      shop: GameShop,
      language: string
    ) => Promise<ShopDetailsWithAssets | null>;
    getRandomGame: () => Promise<Steam250Game>;
    getLocalResource: (filename: string) => Promise<unknown>;
    getGameStats: (
      objectId: string,
      shop: GameShop
    ) => Promise<{
      downloadCount: number;
      playerCount: number;
      averageScore: number | null;
      reviewCount: number;
    }>;
    getGameAssets: (
      objectId: string,
      shop: GameShop
    ) => Promise<ShopAssets | null>;
    getGamePrices: (steamAppId: string, language?: string) => Promise<GamePrices | null>;

    /* Library */
    toggleAutomaticCloudSync: (
      shop: GameShop,
      objectId: string,
      automaticCloudSync: boolean
    ) => Promise<void>;
    toggleGameMangohud: (
      shop: GameShop,
      objectId: string,
      autoRunMangohud: boolean
    ) => Promise<void>;
    toggleGameGamemode: (
      shop: GameShop,
      objectId: string,
      autoRunGamemode: boolean
    ) => Promise<void>;
    isGamemodeAvailable: () => Promise<boolean>;
    isMangohudAvailable: () => Promise<boolean>;
    isWinetricksAvailable: () => Promise<boolean>;
    addGameToLibrary: (
      shop: GameShop,
      objectId: string,
      title: string
    ) => Promise<void>;
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
    ) => Promise<Game>;
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
    }) => Promise<Game>;
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
    ) => Promise<Game>;
    copyCustomGameAsset: (
      sourcePath: string,
      assetType: "icon" | "logo" | "hero"
    ) => Promise<string>;
    cleanupUnusedAssets: () => Promise<{
      deletedCount: number;
      errors: string[];
    }>;
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
    }) => Promise<Game>;
    createGameShortcut: (
      shop: GameShop,
      objectId: string,
      location: ShortcutLocation
    ) => Promise<boolean>;
    updateExecutablePath: (
      shop: GameShop,
      objectId: string,
      executablePath: string | null
    ) => Promise<void>;
    addGameToFavorites: (shop: GameShop, objectId: string) => Promise<void>;
    removeGameFromFavorites: (
      shop: GameShop,
      objectId: string
    ) => Promise<void>;
    assignGameToCollection: (
      shop: GameShop,
      objectId: string,
      collectionIds: string[]
    ) => Promise<void>;
    clearNewDownloadOptions: (
      shop: GameShop,
      objectId: string
    ) => Promise<void>;
    toggleGamePin: (
      shop: GameShop,
      objectId: string,
      pinned: boolean
    ) => Promise<void>;
    updateLaunchOptions: (
      shop: GameShop,
      objectId: string,
      launchOptions: string | null
    ) => Promise<void>;
    selectGameWinePrefix: (
      shop: GameShop,
      objectId: string,
      winePrefixPath: string | null
    ) => Promise<void>;
    selectGameProtonPath: (
      shop: GameShop,
      objectId: string,
      protonPath: string | null
    ) => Promise<void>;
    getInstalledProtonVersions: () => Promise<ProtonVersion[]>;
    recommendProton: (gameId: string) => Promise<ProtonRecommendation | null>;
    getForkCatalog: () => Promise<{
      id: string;
      name: string;
      category: string;
      ranking: string;
      tierScore: number;
      versionCount: number;
      versions: string[];
      description: string;
      source: string;
      features: string[];
    }[]>;
    getProtonDbData: (gameId: string) => Promise<{
      gameId: string;
      steamAppId: string;
      totalReports: number;
      versions: Array<{
        version: string;
        total: number;
        positive: number;
        negative: number;
        positiveRatio: number;
      }>;
      recommended: string[];
    } | null>;
    getGameLaunchProtonVersion: (
      shop: GameShop,
      objectId: string
    ) => Promise<string | null>;
    verifyExecutablePathInUse: (executablePath: string) => Promise<Game>;
    getLibrary: () => Promise<LibraryGame[]>;
    refreshLibraryAssets: () => Promise<void>;
    openGameInstaller: (shop: GameShop, objectId: string, protonPath?: string | null, gameTitle?: string | null, folderName?: string | null) => Promise<{
      wasOpened: boolean;
      positivePaths: string[];
      allPaths: string[];
      suggestedDir: string | null;
      executableSelectWindowOpened?: boolean;
      candidates?: { path: string; name: string; size: number }[];
      prefixDriveCPath?: string;
      gameTitle?: string;
      shop?: string;
      objectId?: string;
    }>;
    getGameInstallerActionType: (
      shop: GameShop,
      objectId: string
    ) => Promise<"install" | "open-folder">;
    openGameInstallerPath: (shop: GameShop, objectId: string) => Promise<void>;
    openGameWinetricks: (shop: GameShop, objectId: string) => Promise<boolean>;
    checkGameDlls: (shop: GameShop, objectId: string) => Promise<{ installed: string[]; errors: string[] }>;
    openGameExecutablePath: (shop: GameShop, objectId: string) => Promise<void>;
    openGameWinePrefix: (shop: GameShop, objectId: string) => Promise<void>;
    setGameExecutablePath: (shop: GameShop, objectId: string, executablePath: string) => Promise<void>;
    openExeFilePicker: (defaultPath?: string) => Promise<string | null>;
    getGameSaveFolder: (
      shop: GameShop,
      objectId: string
    ) => Promise<string | null>;
    openGameSaveFolder: (
      shop: GameShop,
      objectId: string,
      saveFolderPath: string
    ) => Promise<boolean>;
    openGame: (
      shop: GameShop,
      objectId: string,
      executablePath: string,
      launchOptions?: string | null
    ) => Promise<void>;
    closeGame: (shop: GameShop, objectId: string) => Promise<boolean>;
    removeGameFromLibrary: (shop: GameShop, objectId: string) => Promise<void>;
    removeGame: (shop: GameShop, objectId: string) => Promise<void>;
    deleteGameFolder: (shop: GameShop, objectId: string) => Promise<unknown>;
    deleteGamePrefix: (shop: GameShop, objectId: string) => Promise<void>;
    runWineTool: (
      shop: GameShop,
      objectId: string,
      tool: string
    ) => Promise<boolean>;
    installLibrary: (
      shop: GameShop,
      objectId: string,
      libraryId: string
    ) => Promise<{ success: boolean; error?: string }>;
    onLibraryInstallProgress: (
      cb: (data: { libraryId: string; phase: string }) => void
    ) => () => void;
    checkX11Support: () => Promise<{
      installed: boolean;
      packages: string[];
      distro: string;
    }>;
    installX11Support: () => Promise<{ success: boolean; terminal?: string }>;
    deleteGameCompletely: (shop: GameShop, objectId: string) => Promise<void>;
    deleteGameWithPrefix: (shop: GameShop, objectId: string) => Promise<void>;
    getGameByObjectId: (
      shop: GameShop,
      objectId: string
    ) => Promise<LibraryGame | null>;
    onGamesRunning: (
      cb: (
        gamesRunning: Pick<GameRunning, "id" | "sessionDurationInMillis">[]
      ) => void
    ) => () => Electron.IpcRenderer;

    onLibraryBatchComplete: (cb: () => void) => () => Electron.IpcRenderer;
    changeGamePlayTime: (
      shop: GameShop,
      objectId: string,
      playtimeInSeconds: number
    ) => Promise<void>;
    /* User preferences */
    getUserPreferences: () => Promise<UserPreferences | null>;
    updateUserPreferences: (
      preferences: Partial<UserPreferences>
    ) => Promise<void>;
    autoLaunch: (autoLaunchProps: {
      enabled: boolean;
      minimized: boolean;
    }) => Promise<void>;
    extractGameDownload: (shop: GameShop, objectId: string) => Promise<boolean>;
    scanInstalledGames: () => Promise<{
      foundGames: { title: string; executablePath: string }[];
      total: number;
    }>;
    onExtractionComplete: (
      cb: (shop: GameShop, objectId: string) => void
    ) => () => Electron.IpcRenderer;
    onExtractionProgress: (
      cb: (shop: GameShop, objectId: string, progress: number) => void
    ) => () => Electron.IpcRenderer;
    onExtractionFailed: (
      cb: (shop: GameShop, objectId: string) => void
    ) => () => Electron.IpcRenderer;
    onArchiveDeletionPrompt: (
      cb: (archivePaths: string[]) => void
    ) => () => Electron.IpcRenderer;
    deleteArchive: (filePath: string) => Promise<boolean>;
    installAndScan: (filePath: string, options: any) => Promise<unknown>;
    repairGame: (shop: GameShop, objectId: string) => Promise<void>;
    getDefaultWinePrefixSelectionPath: () => Promise<string | null>;
    createSteamShortcut: (
      shop: GameShop,
      objectId: string,
      options?: CreateSteamShortcutOptions
    ) => Promise<void>;
    deleteSteamShortcut: (shop: GameShop, objectId: string) => Promise<void>;
    checkSteamShortcut: (shop: GameShop, objectId: string) => Promise<boolean>;

    /* Download sources */
    addDownloadSource: (url: string) => Promise<DownloadSource>;
    removeDownloadSource: (
      removeAll = false,
      downloadSourceId?: string
    ) => Promise<void>;
    getDownloadSources: () => Promise<DownloadSource[]>;
    syncDownloadSources: () => Promise<void>;
    getDownloadSourcesCheckBaseline: () => Promise<string | null>;
    getDownloadSourcesSinceValue: () => Promise<string | null>;

    /* Hardware */
    getDiskFreeSpace: (path: string) => Promise<DiskUsage>;
    checkFolderWritePermission: (path: string) => Promise<boolean>;

    /* Cloud save */
    uploadSaveGame: (
      objectId: string,
      shop: GameShop,
      downloadOptionTitle: string | null
    ) => Promise<void>;
    downloadGameArtifact: (
      objectId: string,
      shop: GameShop,
      gameArtifactId: string
    ) => Promise<void>;
    getGameArtifacts: (
      objectId: string,
      shop: GameShop
    ) => Promise<GameArtifact[]>;
    getGameBackupPreview: (
      objectId: string,
      shop: GameShop
    ) => Promise<LudusaviBackup | null>;
    selectGameBackupPath: (
      shop: GameShop,
      objectId: string,
      backupPath: string | null
    ) => Promise<void>;
    onBackupDownloadComplete: (
      objectId: string,
      shop: GameShop,
      cb: () => void
    ) => () => Electron.IpcRenderer;
    onUploadComplete: (
      objectId: string,
      shop: GameShop,
      cb: () => void
    ) => () => Electron.IpcRenderer;
    onBackupDownloadProgress: (
      objectId: string,
      shop: GameShop,
      cb: (progress: AxiosProgressEvent) => void
    ) => () => Electron.IpcRenderer;

    /* Misc */
    openExternal: (src: string) => Promise<void>;
    openCheckout: () => Promise<void>;
    getVersion: () => Promise<string>;
    isStaging: () => Promise<boolean>;
    ping: () => string;
    getDefaultDownloadsPath: () => Promise<string>;
    getUserHomePath: () => Promise<string>;
    isPortableVersion: () => Promise<boolean>;
    showOpenDialog: (
      options: Electron.OpenDialogOptions
    ) => Promise<Electron.OpenDialogReturnValue>;
    showItemInFolder: (path: string) => Promise<void>;
    getImageDataUrl: (imageUrl: string) => Promise<string | null>;
    forgerApi: {
      get: <T = unknown>(
        url: string,
        options?: {
          params?: unknown;
          needsAuth?: boolean;
          needsSubscription?: boolean;
          ifModifiedSince?: Date;
        }
      ) => Promise<T>;
      post: <T = unknown>(
        url: string,
        options?: {
          data?: unknown;
          needsAuth?: boolean;
          needsSubscription?: boolean;
        }
      ) => Promise<T>;
      put: <T = unknown>(
        url: string,
        options?: {
          data?: unknown;
          needsAuth?: boolean;
          needsSubscription?: boolean;
        }
      ) => Promise<T>;
      patch: <T = unknown>(
        url: string,
        options?: {
          data?: unknown;
          needsAuth?: boolean;
          needsSubscription?: boolean;
        }
      ) => Promise<T>;
      delete: <T = unknown>(
        url: string,
        options?: {
          needsAuth?: boolean;
          needsSubscription?: boolean;
        }
      ) => Promise<T>;
    };
    canInstallCommonRedist: () => Promise<boolean>;
    installCommonRedist: () => Promise<void>;
    installForgerDeckyPlugin: () => Promise<{
      success: boolean;
      path: string;
      currentVersion: string | null;
      expectedVersion: string;
      error?: string;
    }>;
    getForgerDeckyPluginInfo: () => Promise<{
      installed: boolean;
      version: string | null;
      path: string;
      outdated: boolean;
      expectedVersion: string | null;
    }>;
    checkHomebrewFolderExists: () => Promise<boolean>;
    onCommonRedistProgress: (
      cb: (value: { log: string; complete: boolean }) => void
    ) => () => Electron.IpcRenderer;
    onPreflightProgress: (
      cb: (value: { status: string; detail: string | null }) => void
    ) => () => Electron.IpcRenderer;
    resetCommonRedistPreflight: () => Promise<void>;
    getPendingExecutableSelection: () => Promise<{
      candidates: { path: string; name: string; size: number }[];
      prefixDriveCPath: string;
      gameTitle: string;
      shop: string;
      objectId: string;
    } | null>;
    confirmExecutableSelection: (shop: string, objectId: string, executablePath: string) => Promise<void>;
    cancelExecutableSelection: () => Promise<void>;
    onSelectExecutable: (cb: (value: { candidates: { path: string; name: string; size: number }[]; suggestedDir: string | null; prefixDriveCPath: string; shop: string; objectId: string }) => void) => () => Electron.IpcRenderer;
    onGameExecutableUpdated: (cb: () => void) => () => Electron.IpcRenderer;
    selectExecutable: (shop: string, objectId: string, path: string) => Promise<void>;
    getGameLogLines: (shop: string, objectId: string) => Promise<string[]>;
    clearGameLog: (shop: string, objectId: string) => Promise<void>;
    onGameLogLine: (cb: (data: { shop: string; objectId: string; lines: string[] }) => void) => () => Electron.IpcRenderer;
    onOpenGameLog: (cb: (data: { shop: string; objectId: string }) => void) => () => Electron.IpcRenderer;
    saveTempFile: (fileName: string, fileData: Uint8Array) => Promise<string>;
    deleteTempFile: (filePath: string) => Promise<void>;
    platform: NodeJS.Platform;

    /* Auto update */
    onAutoUpdaterEvent: (
      cb: (event: AppUpdaterEvent) => void
    ) => () => Electron.IpcRenderer;
    checkForUpdates: () => Promise<boolean>;
    restartAndInstallUpdate: () => Promise<void>;

    /* Auth */
    getAuth: () => Promise<Auth | null>;
    signOut: () => Promise<void>;
    openAuthWindow: (page: AuthPage) => Promise<void>;
    getSessionHash: () => Promise<string | null>;
    onSignIn: (cb: () => void) => () => Electron.IpcRenderer;
    onAccountUpdated: (cb: () => void) => () => Electron.IpcRenderer;
    onSignOut: (cb: () => void) => () => Electron.IpcRenderer;

    /* Makai Auth (site2) */
    authLogin: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
    authRegister: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    authLogout: () => Promise<{ success: boolean }>;
    getMakaiAuth: () => Promise<{ token: string; user: { id: number; username: string; role: string; is_admin: boolean } } | null>;

    /* Makai Profile */
    getMakaiProfile: () => Promise<any>;
    getAchievementIconUrl: (iconPath: string | null | undefined) => Promise<string | null>;

    /* Makai Notifications */
    getNotifications: () => Promise<{ notifications: MakaiNotification[] }>;
    getUnreadNotificationsCount: () => Promise<number>;
    markNotificationsRead: (ids: number[]) => Promise<{ success: boolean }>;

    /* Profile */
    getMe: () => Promise<UserDetails | null>;
    updateProfile: (
      updateProfile: UpdateProfileRequest
    ) => Promise<UserProfile>;
    updateProfile: (updateProfile: UpdateProfileProps) => Promise<UserProfile>;
    processProfileImage: (
      path: string
    ) => Promise<{ imagePath: string; mimeType: string }>;
    onSyncFriendRequests: (
      cb: (friendRequests: FriendRequestSync) => void
    ) => () => Electron.IpcRenderer;
    onSyncNotificationCount: (
      cb: (notification: NotificationSync) => void
    ) => () => Electron.IpcRenderer;
    updateFriendRequest: (
      userId: string,
      action: FriendRequestAction
    ) => Promise<void>;

    /* Notifications */
    publishNewRepacksNotification: (newRepacksCount: number) => Promise<void>;
    getLocalNotifications: () => Promise<LocalNotification[]>;
    getLocalNotificationsCount: () => Promise<number>;
    markLocalNotificationRead: (id: string) => Promise<void>;
    markAllLocalNotificationsRead: () => Promise<void>;
    deleteLocalNotification: (id: string) => Promise<void>;
    clearAllLocalNotifications: () => Promise<void>;
    onLocalNotificationCreated: (
      cb: (notification: LocalNotification) => void
    ) => () => Electron.IpcRenderer;
    /* Themes */
    addCustomTheme: (theme: Theme) => Promise<void>;
    importJsonTheme: () => Promise<Theme | null>;
    getAllCustomThemes: () => Promise<Theme[]>;
    deleteAllCustomThemes: () => Promise<void>;
    deleteCustomTheme: (themeId: string) => Promise<void>;
    updateCustomTheme: (themeId: string, code: string) => Promise<void>;
    getCustomThemeById: (themeId: string) => Promise<Theme | null>;
    getActiveCustomTheme: () => Promise<Theme | null>;
    toggleCustomTheme: (themeId: string, isActive: boolean) => Promise<void>;
    getThemeSoundPath: (themeId: string) => Promise<string | null>;
    getThemeSoundDataUrl: (themeId: string) => Promise<string | null>;
    importThemeSoundFromStore: (
      themeId: string,
      themeName: string,
      storeUrl: string
    ) => Promise<void>;
    importMakaiTheme: (fileArg?: string | ArrayBuffer | Uint8Array) => Promise<Theme | null>;
    extractThemeAssets: (fileBuffer: ArrayBuffer | Uint8Array, theme: Theme) => Promise<{ background?: string; sidebarBg?: string; sound?: string; screenshot?: string }>;
    getThemeAssetPath: (
      themeId: string,
      assetType: "background" | "sidebarBg" | "sound" | "screenshot"
    ) => Promise<string | null>;
    migrateThemesToV3: () => Promise<void>;

    /* Editor */
    openEditorWindow: (themeId: string) => Promise<void>;
    onCustomThemeUpdated: (cb: () => void) => () => Electron.IpcRenderer;
    closeEditorWindow: (themeId?: string) => Promise<void>;

    /* Game Launcher Window */
    showGameLauncherWindow: () => Promise<void>;
    closeGameLauncherWindow: () => Promise<void>;
    openMainWindow: () => Promise<void>;
    isMainWindowOpen: () => Promise<boolean>;

    /* Download Options */
    onNewDownloadOptions: (
      cb: (gamesWithNewOptions: { gameId: string; count: number }[]) => void
    ) => () => Electron.IpcRenderer;

    /* Store Generic CRUD */
    store: {
      get: (
        key: string,
        sublevelName?: string | null,
        valueEncoding?: "json" | "utf8"
      ) => Promise<unknown>;
      put: (
        key: string,
        value: unknown,
        sublevelName?: string | null,
        valueEncoding?: "json" | "utf8"
      ) => Promise<void>;
      del: (key: string, sublevelName?: string | null) => Promise<void>;
      clear: (sublevelName: string) => Promise<void>;
      values: (sublevelName: string) => Promise<unknown[]>;
      iterator: (sublevelName: string) => Promise<[string, unknown][]>;
    };

    modsStore: {
      get: (key: string) => Promise<unknown>;
      put: (key: string, value: unknown) => Promise<boolean>;
      del: (key: string) => Promise<boolean>;
      values: (prefix?: string) => Promise<unknown[]>;
    };

    /* Transfer Game */
    getAvailableDrives: () => Promise<DriveInfo[]>;
    transferGameFiles: (
      shop: GameShop,
      objectId: string,
      destParent: string
    ) => Promise<{
      ok: boolean;
      error?: string;
      needed?: number;
      available?: number;
      newExePath?: string;
    }>;

    // Cancel for game transfers
    cancelGameTransfer: (shop: GameShop, objectId: string) => Promise<void>;

    /* Proton Manager */
    getProtonTools: () => Promise<unknown[]>;
    getProtonToolsByCategory: (category: string) => Promise<unknown[]>;
    getProtonReleases: (toolId: string) => Promise<unknown[]>;
    downloadProtonTool: (toolId: string, release: unknown) => Promise<boolean>;
    downloadProton: (fork: {
      fork: string;
      name: string;
      version: string;
      tier: string;
      tierScore: number;
      confidence: string;
      note?: string;
    }) => Promise<string | null>;
    analyzeGameExe: (exePath: string) => Promise<{
      success: boolean;
      error?: string;
      type?: string;
      original?: string;
      clean_name?: string;
      game_name?: string | null;
      app?: string;
      protonforge?: Record<string, unknown>;
    }>;
    getInstalledProtonTools: () => Promise<unknown[]>;
    getProtonInstallDir: () => Promise<string>;
    removeProtonTool: (toolId: string, version: string) => Promise<boolean>;
    fetchProtonReadme: (
      repoUrl: string
    ) => Promise<{ success: boolean; content?: string; error?: string }>;

    /* Games JSON files */
    gamesJsonGetAll: () => Promise<unknown[]>;
    gamesJsonGet: (id: string) => Promise<unknown | null>;
    gamesJsonSave: (game: Record<string, unknown>) => Promise<boolean>;
    gamesJsonDelete: (id: string) => Promise<boolean>;

    /* Event listeners for transfer progress */
    on: (channel: string, listener: (...args: any[]) => void) => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;

    /* Mod Manager */
    readPlugins: (path: string, starPrefix?: boolean) => Promise<PluginEntry[]>;
    writePlugins: (path: string, entries: PluginEntry[], starPrefix?: boolean) => Promise<boolean>;
    detectConflicts: (gameId: string, enabledMods: { name: string; priority: number }[]) => Promise<FileConflict[]>;
    preparePrefix: (gameName: string) => Promise<{ success: boolean; log: string[] }>;
    getGameProtonInfo: (gameName: string) => Promise<{
      appId: string | null;
      currentProton: { name: string; priority: string } | null;
      recommendation: any | null;
      installedForks: { fork: string; name: string; version: string; tier: string; tierScore: number; confidence: string; note?: string }[];
      recommendedDlls: any | null;
      prefixPath: string | null;
      steamPath: string | null;
      protonPath: string | null;
      compatInfo: any | null;
      error: string | null;
      status: string;
    }>;
    setupProtonEnvironment: (gameName: string, protonPath: string, prefixPath: string, clean?: boolean) => Promise<{ success: boolean; log: string[] }>;
    onProtonInfoProgress: (cb: (progress: { step: string; status: string }) => void) => () => void;
    onProtonSetupLog: (cb: (line: string) => void) => () => void;
    onPrefixProgress: (cb: (appId: string, msg: string) => void) => () => void;
    eslify: (pluginPath: string, dryRun?: boolean, safeCheck?: boolean) => Promise<EslifyResult>;
    bsaInvalidate: (gamePath: string, gameId: string, enable: boolean) => Promise<void>;
    bsaExtract: (archivePath: string, destDir: string, listOnly?: boolean) => Promise<{ ok: boolean; data?: { files: string[]; count: number }; error?: string }>;
    ba2Extract: (archivePath: string, destDir: string, listOnly?: boolean) => Promise<{ ok: boolean; data?: { files: string[]; count: number }; error?: string }>;
    archiveList: (archivePath: string) => Promise<{ ok: boolean; data?: { format: string; files: string[]; count: number }; error?: string }>;
    seCheck: (gameId: string, gamePath: string) => Promise<{ ok: boolean; data?: { installed: boolean; loader_found: boolean; dll_found: boolean; dir_found: boolean; version: string | null }; error?: string }>;
    seInstall: (gameId: string, gamePath: string) => Promise<{ ok: boolean; data?: { extender: string; files_copied: number; game_path: string; url: string }; error?: string }>;
    mo2Import: (modlistPath: string, stagingDir?: string) => Promise<{ ok: boolean; data?: { total: number; enabled_count: number; disabled_count: number; separators: number; unmatched_count: number; entries: any[]; unmatched: any[] }; error?: string }>;
    mo2Export: (entries: any[], outputPath: string) => Promise<{ ok: boolean; data?: { path: string; entries: number; lines: number }; error?: string }>;
    bainDetect: (archivePath: string) => Promise<{ ok: boolean; is_bain?: boolean; data?: { packages: { order: number; name: string; directory: string; file_count: number }[]; total_files: number }; error?: string }>;
    bainInstall: (archivePath: string, stagingDir: string, selectedPackages: number[]) => Promise<{ ok: boolean; data?: { packages_installed: number; files_extracted: number; install_path: string }; error?: string }>;
    rescanStaging: (gameId: string, profileName: string) => Promise<{ newMods: any[]; deadMods: any[]; stagingDir: string; totalTracked: number; totalStaging: number }>;
    scanExternalTools: (gameId: string) => Promise<{ found: { name: string; exePath: string; args: string }[]; gamePath: string; error?: string }>;
    parseFomod: (stagingDir: string) => Promise<FomodConfig | null>;
    installFomod: (stagingDir: string, targetDir: string, selections: Record<string, string[]>) => Promise<{ success: boolean; log: string[]; filesCopied: number }>;
    deployMods: (gameId: string, profile: string) => Promise<DeploymentResult>;
    installModOrchestrated: (archivePath: string, config: {
      gameId: string;
      profile: string;
      stagingDir: string;
      overwriteExisting: boolean;
      verifyAfterExtract: boolean;
      maxRetries: number;
      timeoutMs: number;
    }) => Promise<{
      success: boolean;
      modName: string;
      stagingDir: string;
      archiveInfo: {
        path: string;
        name: string;
        totalSize: number;
        totalFiles: number;
        compressedSize: number;
        format: string;
        isPasswordProtected: boolean;
        entries: Array<{
          path: string;
          size: number;
          compressedSize: number;
          isDirectory: boolean;
          crc32?: string;
        }>;
      };
      extractedFiles: Array<{
        relativePath: string;
        absolutePath: string;
        expectedSize: number;
        actualSize: number;
        expectedCrc32?: string;
        actualCrc32?: string;
        verified: boolean;
      }>;
      verified: boolean;
      plugins: string[];
      hasFomod: boolean;
      hasSkse: boolean;
      category: string;
      error?: string;
      durationMs: number;
    }>;
    abortInstall: () => Promise<{ ok: boolean; error?: string }>;
    onModInstallProgress: (cb: (data: any) => void) => () => void;
    modLoadOrderSort: (gameId: string, plugins: { filename: string; masters?: string[] }[]) => Promise<{ ok: boolean; data?: { sorted: { filename: string }[]; warnings: string[]; validation: unknown[] }; error?: string }>;
    modValidateLoadOrder: (gameId: string, plugins: { filename: string; masters?: string[] }[]) => Promise<{ ok: boolean; data?: { validation: unknown[]; warnings: string[] }; error?: string }>;
    listModFiles: (stagingDir: string) => Promise<{ name: string; path: string; isDirectory: boolean; children: any[] }[]>;
    listIniFiles: (profileDir: string) => Promise<{ name: string; path: string; content: string }[]>;
    listDataFolder: (gamePath: string, gameId?: string) => Promise<any[]>;
    saveGameConfig: (gameName: string, config: { gamePath: string; stagingDir: string; protonPrefix: string; protonVersion?: string }) => Promise<{ ok: boolean }>;
    getGameConfig: (gameName: string) => Promise<any>;
    listGameConfigs: () => Promise<{ name: string; config: any }[]>;
    modLaunchGame: (gameId: string) => Promise<{ success: boolean; method?: string; error?: string }>;
    modPlayGame: (gameId: string, profile?: string) => Promise<{ success: boolean; method?: string; error?: string; failedStep?: string; gamePath?: string }>;
    modKillGame: () => Promise<boolean>;
    modScanFixGame: (gameId: string) => Promise<{ success: boolean; gamePath?: string; skseFound?: boolean; error?: string }>;
    onModLaunchProgress: (cb: (data: { step: string; message: string; status: "working" | "done" | "error" | "prompt"; promptType?: string }) => void) => () => void;
    modRunWineTool: (gameId: string, tool: string) => Promise<{ success: boolean; error?: string }>;
    getModGameInfo: (gameId: string) => Promise<{ gameId: string; name: string; steamAppId?: string; exeName?: string; nexusDomain?: string; lootType?: string; dataFolder?: string } | null>;
    modDetectGamePath: (gameId: string) => Promise<string | null>;
    removeMod: (gameId: string, profile: string, modName: string) => Promise<{ ok: boolean }>;
    deleteMod: (gameId: string, profile: string, modName: string) => Promise<{ ok: boolean }>;
    modBridgeListGames: () => Promise<{ ok: boolean; data?: any; error?: string }>;
    modListKnownGames: () => Promise<{ ok: boolean; data?: { name: string; game_id: string; steam_id: string; configured: boolean; game_path: string; exe_name: string; loot_enabled: boolean; loot_game_type: string; nexus_game_domain: string; data_folder_name: string; plugin_extensions: string[] }[]; error?: string }>;

    getExternalTools: (gameId: string) => Promise<ExternalTool[]>;
    saveExternalTool: (tool: ExternalTool) => Promise<{ ok: boolean }>;
    removeExternalTool: (name: string, gameId: string) => Promise<{ ok: boolean }>;
    launchExternalTool: (gameId: string, toolName: string) => Promise<{ ok: boolean; error?: string; data?: { launched: string } }>;

    modBridgeDiscoverGames: () => Promise<{ ok: boolean; data?: any; error?: string }>;

    /* Game DLL Catalog */
    getGameDllCatalog: () => Promise<{ ok: boolean; data?: { _version: number; games: any[] }; error?: string }>;
    getGameDllInfo: (gameId: string) => Promise<any>;
    detectGameManual: (gameId: string, selectedPath: string) => Promise<{ ok: boolean; data?: { gamePath: string; stagingDir: string; protonPrefix: string }; error?: string }>;
    prefixHealthCheck: (gameId: string) => Promise<{ ok: boolean; data?: HealthReport; error?: string }>;
    prefixAutoFix: (gameId: string) => Promise<{ ok: boolean; data?: { fixed: string[]; errors: string[] }; error?: string }>;
    createModPrefix: (gameId: string) => Promise<{ ok: boolean; data?: { prefixPath: string; initialized: boolean; dllsInstalled: string[]; errors: string[] }; error?: string }>;
    switchProton: (gameId: string, protonPath: string) => Promise<{ ok: boolean; data?: { newProtonPath: string; prefixPath: string; savesRestored: number; dllsInstalled: string[] }; error?: string }>;
    installGameDlls: (gameId: string, extraVerbs?: string[]) => Promise<{ ok: boolean; data?: { installed: string[]; errors: string[] }; error?: string }>;
    modBridgeSetContext: (ctx: { source: string; gameId: string; prefixPath: string; gamePath?: string }) => Promise<{ ok: boolean; data?: any }>;
    modBridgeGetContext: () => Promise<{ ok: boolean; data?: { source: string; gameId: string; prefixPath: string; gamePath?: string } }>;
    modBridgeClearContext: () => Promise<{ ok: boolean }>;

    readModFile: (filePath: string) => Promise<{ type: "image" | "text"; content: string; ext: string } | null>;
    scanModFolder: (dirPath: string, scanType: "image" | "readme") => Promise<{ fullPath: string; name: string }[]>;
    checkModsMedia: (stagingDirs: string[]) => Promise<Record<string, { hasPreview: boolean; hasReadme: boolean }>>;

    /* Steam */
    syncSteamLibrary: () => Promise<SteamInstalledGame[]>;
    getSteamGameConfig: (appId: string) => Promise<Record<string, any> | null>;
    setSteamGameConfig: (appId: string, config: Record<string, any>) => Promise<void>;
    clearSteamPrefix: (appId: string, protonName?: string) => Promise<boolean>;
    ensureGamePrefix: (appId: string, protonName?: string) => Promise<{ success: boolean; appId: string; protonName: string | null; pfxDir?: string; error?: string }>;
    getSteamGameProton: (appId: string) => Promise<{ name: string; priority: number } | null>;
    setSteamGameProton: (appId: string, protonName: string | null) => Promise<boolean>;
    getCompatibilityTools: () => Promise<unknown[]>;

    /* Backup — Cloud */
    onBackupProgress: (cb: (progress: { percent: number; status: string }) => void) => () => Electron.IpcRenderer;
    onBackupError: (cb: (error: { message: string }) => void) => () => Electron.IpcRenderer;
    backupGetStatus: () => Promise<{ loggedIn: boolean; provider?: string; [key: string]: unknown }>;
    backupOAuthLogin: (provider: string) => Promise<{ success: boolean; error?: string }>;
    backupOAuthLogout: () => Promise<unknown>;
    backupStart: () => Promise<{ success: boolean; error?: string; steamCount?: number; localCount?: number; customCount?: number; hadJsons?: boolean; totalSizeMb?: number; timestamp?: string }>;
    backupRestore: (files?: string[]) => Promise<{ success: boolean; error?: string }>;
    backupListFiles: () => Promise<{ success: boolean; exists?: boolean; file?: { name: string; sizeBytes: number; lastModified: string }; error?: string }>;

    /* Backup — Mod (modlist + plugins + state) */
    listBackups: (gameId: string, profile: string) => Promise<{ timestamp: string; label: string; kept: boolean; dir: string }[]>;
    createBackup: (gameId: string, profile: string) => Promise<{ timestamp: string; label: string; kept: boolean; dir: string }>;
    restoreBackup: (gameId: string, profile: string, backupDir: string) => Promise<boolean>;
    setBackupKept: (backupDir: string, kept: boolean) => Promise<void>;

    /* Mod Manager */
    getHomeDeals: () => Promise<DealData[]>;
    getHomeDealsCached: () => Promise<DealData[] | null>;
    getLinuxNews: (language?: string) => Promise<NewsArticle[]>;
    getLinuxNewsCached: (language?: string) => Promise<NewsArticle[] | null>;
    getFreeGames: (language?: string) => Promise<FreeGameData[]>;
    getFreeGamesCached: () => Promise<FreeGameData[] | null>;

    /* Chrome Browser (CDP Mirror) */
    chromeLaunch: () => Promise<{ success: boolean; tabsCount?: number; error?: string }>;
    chromeSetupAndLaunch: (mirrorId?: string) => Promise<{ success: boolean; tabsCount?: number; error?: string }>;
    chromeClose: () => Promise<{ success: boolean }>;
    chromeNavigate: (tabId: string, url: string) => Promise<{ success: boolean; url?: string; error?: string }>;
    chromeNewTab: (url?: string) => Promise<{ success: boolean; tabId?: string; error?: string }>;
    chromeCloseTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
    chromeSwitchTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
    chromeGetTabs: () => Promise<Array<{ id: string; url: string; title: string; active: boolean; audible: boolean }>>;
    chromeGetActiveTab: () => Promise<string | null>;
    chromeSetZoom: (tabId: string, factor: number) => Promise<{ success: boolean }>;
    chromeGetZoom: (tabId: string) => Promise<{ factor: number }>;
    chromeSetPageMuted: (tabId: string, muted: boolean) => Promise<{ success: boolean }>;
    chromeIsPageMuted: (tabId: string) => Promise<{ muted: boolean }>;
    chromeNavigateBack: (tabId: string) => Promise<void>;
    chromeNavigateForward: (tabId: string) => Promise<void>;
    chromeGetNavHistory: (tabId: string) => Promise<{ canGoBack: boolean; canGoForward: boolean }>;
    chromeOpenDevtools: (tabId: string) => Promise<void>;
    chromeGetBrowserStatus: () => Promise<{ running: boolean; tabsCount: number; activeTabId: string | null }>;
    chromeSendInput: (data: any) => void;
    chromeResizeViewport: (width: number, height: number) => void;
    onChromeSetupProgress: (cb: (progress: { status: string; detail?: string; progress: number; done?: boolean }) => void) => () => void;
    onChromeScreencastFrame: (cb: (frame: { data: string | Uint8Array; sessionId: number; tabId: string; mirrorId?: string }) => void) => () => void;
    onChromeTabList: (cb: (tabs: Array<{ id: string; url: string; title: string; active: boolean; audible: boolean }>) => void) => () => void;
    onChromeNavigation: (cb: (data: { tabId: string; url: string }) => void) => () => void;

    /* Find in page */
    chromeFindInPage: (tabId: string, query: string, forward: boolean) => Promise<{ found: boolean }>;
    chromeCountMatches: (tabId: string, query: string) => Promise<{ count: number }>;
    chromeClearFind: (tabId: string) => Promise<void>;

    /* Bookmarks */
    chromeGetBookmarks: () => Promise<Array<{ url: string; title: string }>>;
    chromeAddBookmark: (url: string, title: string) => Promise<{ success: boolean }>;
    chromeRemoveBookmark: (url: string) => Promise<{ success: boolean }>;
    onChromeBookmarksChanged: (cb: (bookmarks: Array<{ url: string; title: string }>) => void) => () => void;

    /* Extensions */
    chromeGetExtensions: () => Promise<Array<{ id: string; name: string; icon: string }>>;
    chromeGetExtensionState: () => Promise<{ enabled: boolean; state: string }>;
    chromeToggleExtension: (enabled: boolean) => Promise<{ success: boolean }>;

    /* Runners */
    getRunners: () => Promise<import("@emulators/types").RunnerDefinition[]>;
    getRunnerStatus: (runnerId: string) => Promise<import("@emulators/types").RunnerStatus>;
    getAllRunnersStatus: () => Promise<Record<string, import("@emulators/types").RunnerStatus | null>>;
    getRunnerIcon: (runnerId: string) => Promise<string | null>;
    installRunner: (runnerId: string) => Promise<import("@emulators/types").RunnerStatus>;
    uninstallRunner: (runnerId: string) => Promise<{ id: string; isInstalled: boolean }>;
    launchGame: (runnerId: string, romPath: string) => Promise<void>;
    closeRunner: (runnerId: string) => Promise<void>;
    checkRunnerUpdates: (runnerId?: string) => Promise<Array<{ runnerId: string; humanName: string; currentVersion: string; latestVersion: string }>>;
    shouldCheckRunnerUpdates: () => Promise<boolean>;
    getRunnersWithUpdates: () => Promise<Array<{ runnerId: string; humanName: string; currentVersion: string; latestVersion: string }>>;
    onRunnerUpdatesAvailable: (cb: (updates: Array<{ runnerId: string; humanName: string; currentVersion: string; latestVersion: string }>) => void) => () => void;
    onRunnerStarted: (cb: (runnerId: string) => void) => () => void;
    onRunnerStopped: (cb: (runnerId: string) => void) => () => void;

    /* Scripts */
    getScriptsByGame: (shop: GameShop, objectId: string) => Promise<any[]>;
    getScriptById: (scriptId: string) => Promise<any>;
    installScript: (scriptId: string) => Promise<any>;
    toggleScriptLike: (scriptId: number) => Promise<any>;
    toggleScriptDislike: (scriptId: number) => Promise<any>;
    getScriptComments: (scriptId: number) => Promise<any[]>;
    postScriptComment: (scriptId: number, body: string, parentId?: number) => Promise<any>;
    deleteScriptComment: (scriptId: number, commentId: number) => Promise<any>;
    toggleCommentLike: (scriptId: number, commentId: number) => Promise<any>;
    toggleCommentDislike: (scriptId: number, commentId: number) => Promise<any>;
  }

  interface EslifyResult {
    success: boolean;
    is_esl?: boolean;
    max_formid?: number;
    safe?: boolean;
    new_path?: string;
    error?: string;
  }

  interface Window {
    electron: Electron;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          allowpopups?: string;
          style?: React.CSSProperties;
          preload?: string;
          useragent?: string;
          webpreferences?: string;
          partition?: string;
        },
        HTMLElement
      >;
    }
  }
}
