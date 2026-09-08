import { ipcRenderer } from "electron";
import type { UserPreferences, AppUpdaterEvent, Theme } from "@types";
import type { AxiosProgressEvent } from "axios";

export const appAPI = {
  getUserPreferences: () => ipcRenderer.invoke("getUserPreferences"),
  updateUserPreferences: (preferences: UserPreferences) =>
    ipcRenderer.invoke("updateUserPreferences", preferences),
  autoLaunch: (autoLaunchProps: { enabled: boolean; minimized: boolean }) =>
    ipcRenderer.invoke("autoLaunch", autoLaunchProps),

  getDiskFreeSpace: (path: string) =>
    ipcRenderer.invoke("getDiskFreeSpace", path),
  checkFolderWritePermission: (path: string) =>
    ipcRenderer.invoke("checkFolderWritePermission", path),

  uploadSaveGame: (objectId: string, shop: string, downloadOptionTitle: string | null) =>
    ipcRenderer.invoke("uploadSaveGame", objectId, shop, downloadOptionTitle),
  downloadGameArtifact: (objectId: string, shop: string, gameArtifactId: string) =>
    ipcRenderer.invoke("downloadGameArtifact", objectId, shop, gameArtifactId),
  getGameArtifacts: (objectId: string, shop: string) =>
    ipcRenderer.invoke("getGameArtifacts", objectId, shop),
  getGameBackupPreview: (objectId: string, shop: string) =>
    ipcRenderer.invoke("getGameBackupPreview", objectId, shop),
  selectGameBackupPath: (shop: string, objectId: string, backupPath: string | null) =>
    ipcRenderer.invoke("selectGameBackupPath", shop, objectId, backupPath),
  onUploadComplete: (objectId: string, shop: string, cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(`on-upload-complete-${objectId}-${shop}`, listener);
    return () => ipcRenderer.removeListener(`on-upload-complete-${objectId}-${shop}`, listener);
  },
  onBackupDownloadProgress: (objectId: string, shop: string, cb: (progress: AxiosProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AxiosProgressEvent) => cb(progress);
    ipcRenderer.on(`on-backup-download-progress-${objectId}-${shop}`, listener);
    return () => ipcRenderer.removeListener(`on-backup-download-progress-${objectId}-${shop}`, listener);
  },
  onBackupDownloadComplete: (objectId: string, shop: string, cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(`on-backup-download-complete-${objectId}-${shop}`, listener);
    return () => ipcRenderer.removeListener(`on-backup-download-complete-${objectId}-${shop}`, listener);
  },

  ping: () => ipcRenderer.invoke("ping"),
  getVersion: () => ipcRenderer.invoke("getVersion"),
  getDefaultDownloadsPath: () => ipcRenderer.invoke("getDefaultDownloadsPath"),
  getUserHomePath: () => ipcRenderer.invoke("getUserHomePath"),
  isStaging: () => ipcRenderer.invoke("isStaging"),
  isPortableVersion: () => ipcRenderer.invoke("isPortableVersion"),
  openExternal: (src: string) => ipcRenderer.invoke("openExternal", src),
  openCheckout: () => ipcRenderer.invoke("openCheckout"),
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke("showOpenDialog", options),
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke("showItemInFolder", path),
  getImageDataUrl: (imageUrl: string) =>
    ipcRenderer.invoke("getImageDataUrl", imageUrl),
  forgerApi: {
    get: (url: string, options?: { params?: unknown; needsAuth?: boolean; needsSubscription?: boolean; ifModifiedSince?: Date }) =>
      ipcRenderer.invoke("forgerApiCall", { method: "get", url, params: options?.params, options: { needsAuth: options?.needsAuth, needsSubscription: options?.needsSubscription, ifModifiedSince: options?.ifModifiedSince } }),
    post: (url: string, options?: { data?: unknown; needsAuth?: boolean; needsSubscription?: boolean }) =>
      ipcRenderer.invoke("forgerApiCall", { method: "post", url, data: options?.data, options: { needsAuth: options?.needsAuth, needsSubscription: options?.needsSubscription } }),
    put: (url: string, options?: { data?: unknown; needsAuth?: boolean; needsSubscription?: boolean }) =>
      ipcRenderer.invoke("forgerApiCall", { method: "put", url, data: options?.data, options: { needsAuth: options?.needsAuth, needsSubscription: options?.needsSubscription } }),
    patch: (url: string, options?: { data?: unknown; needsAuth?: boolean; needsSubscription?: boolean }) =>
      ipcRenderer.invoke("forgerApiCall", { method: "patch", url, data: options?.data, options: { needsAuth: options?.needsAuth, needsSubscription: options?.needsSubscription } }),
    delete: (url: string, options?: { needsAuth?: boolean; needsSubscription?: boolean }) =>
      ipcRenderer.invoke("forgerApiCall", { method: "delete", url, options: { needsAuth: options?.needsAuth, needsSubscription: options?.needsSubscription } }),
  },
  canInstallCommonRedist: () => ipcRenderer.invoke("canInstallCommonRedist"),
  installCommonRedist: () => ipcRenderer.invoke("installCommonRedist"),
  installForgerDeckyPlugin: () => ipcRenderer.invoke("installForgerDeckyPlugin"),
  getForgerDeckyPluginInfo: () => ipcRenderer.invoke("getForgerDeckyPluginInfo"),
  checkHomebrewFolderExists: () => ipcRenderer.invoke("checkHomebrewFolderExists"),
  platform: process.platform,

  onAutoUpdaterEvent: (cb: (value: AppUpdaterEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: AppUpdaterEvent) => cb(value);
    ipcRenderer.on("autoUpdaterEvent", listener);
    return () => ipcRenderer.removeListener("autoUpdaterEvent", listener);
  },
  onCommonRedistProgress: (cb: (value: { log: string; complete: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { log: string; complete: boolean }) => cb(value);
    ipcRenderer.on("common-redist-progress", listener);
    return () => ipcRenderer.removeListener("common-redist-progress", listener);
  },
  onPreflightProgress: (cb: (value: { status: string; detail: string | null }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { status: string; detail: string | null }) => cb(value);
    ipcRenderer.on("preflight-progress", listener);
    return () => ipcRenderer.removeListener("preflight-progress", listener);
  },
  onSelectExecutable: (cb: (value: { candidates: { path: string; name: string; size: number }[]; suggestedDir: string | null; prefixDriveCPath: string; shop: string; objectId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: any) => cb(value);
    ipcRenderer.on("select-executable", listener);
    return () => ipcRenderer.removeListener("select-executable", listener);
  },
  selectExecutable: (shop: string, objectId: string, path: string) =>
    ipcRenderer.invoke("selectExecutable", shop, objectId, path),
  resetCommonRedistPreflight: () => ipcRenderer.invoke("resetCommonRedistPreflight"),
  checkForUpdates: () => ipcRenderer.invoke("checkForUpdates"),
  restartAndInstallUpdate: () => ipcRenderer.invoke("restartAndInstallUpdate"),

  publishNewRepacksNotification: (newRepacksCount: number) =>
    ipcRenderer.invoke("publishNewRepacksNotification", newRepacksCount),
  getLocalNotifications: () => ipcRenderer.invoke("getLocalNotifications"),
  getLocalNotificationsCount: () => ipcRenderer.invoke("getLocalNotificationsCount"),
  markLocalNotificationRead: (id: string) => ipcRenderer.invoke("markLocalNotificationRead", id),
  markAllLocalNotificationsRead: () => ipcRenderer.invoke("markAllLocalNotificationsRead"),
  deleteLocalNotification: (id: string) => ipcRenderer.invoke("deleteLocalNotification", id),
  clearAllLocalNotifications: () => ipcRenderer.invoke("clearAllLocalNotifications"),
  onLocalNotificationCreated: (cb: (notification: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, notification: unknown) => cb(notification);
    ipcRenderer.on("on-local-notification-created", listener);
    return () => ipcRenderer.removeListener("on-local-notification-created", listener);
  },

  addCustomTheme: (theme: Theme) => ipcRenderer.invoke("addCustomTheme", theme),
  importJsonTheme: () => ipcRenderer.invoke("importJsonTheme"),
  getAllCustomThemes: () => ipcRenderer.invoke("getAllCustomThemes"),
  deleteAllCustomThemes: () => ipcRenderer.invoke("deleteAllCustomThemes"),
  deleteCustomTheme: (themeId: string) => ipcRenderer.invoke("deleteCustomTheme", themeId),
  updateCustomTheme: (themeId: string, code: string) => ipcRenderer.invoke("updateCustomTheme", themeId, code),
  getCustomThemeById: (themeId: string) => ipcRenderer.invoke("getCustomThemeById", themeId),
  getActiveCustomTheme: () => ipcRenderer.invoke("getActiveCustomTheme"),
  toggleCustomTheme: (themeId: string, isActive: boolean) => ipcRenderer.invoke("toggleCustomTheme", themeId, isActive),
  getThemeSoundPath: (themeId: string) => ipcRenderer.invoke("getThemeSoundPath", themeId),
  getThemeSoundDataUrl: (themeId: string) => ipcRenderer.invoke("getThemeSoundDataUrl", themeId),
  importThemeSoundFromStore: (themeId: string, themeName: string, storeUrl: string) =>
    ipcRenderer.invoke("importThemeSoundFromStore", themeId, themeName, storeUrl),

  openEditorWindow: (themeId: string) => ipcRenderer.invoke("openEditorWindow", themeId),
  onCustomThemeUpdated: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-custom-theme-updated", listener);
    return () => ipcRenderer.removeListener("on-custom-theme-updated", listener);
  },
  onNewDownloadOptions: (cb: (gamesWithNewOptions: { gameId: string; count: number }[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, gamesWithNewOptions: { gameId: string; count: number }[]) =>
      cb(gamesWithNewOptions);
    ipcRenderer.on("on-new-download-options", listener);
    return () => ipcRenderer.removeListener("on-new-download-options", listener);
  },
  closeEditorWindow: (themeId?: string) => ipcRenderer.invoke("closeEditorWindow", themeId),

  showGameLauncherWindow: () => ipcRenderer.invoke("showGameLauncherWindow"),
  closeGameLauncherWindow: () => ipcRenderer.invoke("closeGameLauncherWindow"),
  openMainWindow: () => ipcRenderer.invoke("openMainWindow"),
  isMainWindowOpen: () => ipcRenderer.invoke("isMainWindowOpen"),

  getPendingExecutableSelection: () => ipcRenderer.invoke("getPendingExecutableSelection"),
  confirmExecutableSelection: (shop: string, objectId: string, executablePath: string) =>
    ipcRenderer.invoke("confirmExecutableSelection", shop, objectId, executablePath),
  cancelExecutableSelection: () => ipcRenderer.invoke("cancelExecutableSelection"),

  store: {
    get: (key: string, sublevelName?: string | null, valueEncoding?: "json" | "utf8") =>
      ipcRenderer.invoke("storeGet", key, sublevelName, valueEncoding),
    put: (key: string, value: unknown, sublevelName?: string | null, valueEncoding?: "json" | "utf8") =>
      ipcRenderer.invoke("storePut", key, value, sublevelName, valueEncoding),
    del: (key: string, sublevelName?: string | null) => ipcRenderer.invoke("storeDel", key, sublevelName),
    clear: (sublevelName: string) => ipcRenderer.invoke("storeClear", sublevelName),
    values: (sublevelName: string) => ipcRenderer.invoke("storeValues", sublevelName),
    iterator: (sublevelName: string) => ipcRenderer.invoke("storeIterator", sublevelName),
  },

  getProtonTools: () => ipcRenderer.invoke("getProtonTools"),
  getProtonToolsByCategory: (category: string) => ipcRenderer.invoke("getProtonToolsByCategory", category),
  getProtonReleases: (toolId: string) => ipcRenderer.invoke("getProtonReleases", toolId),
  translateText: (text: string, targetLang: string) => ipcRenderer.invoke("translateText", text, targetLang),
  downloadProtonTool: (toolId: string, release: { tag_name: string; assets: { name: string; browser_download_url: string }[] }) =>
    ipcRenderer.invoke("downloadProtonTool", toolId, release),
  downloadProton: (fork: { fork: string; name: string; version: string; tier: string; tierScore: number; confidence: string; note?: string }) =>
    ipcRenderer.invoke("downloadProton", fork),
  analyzeGameExe: (exePath: string) => ipcRenderer.invoke("analyzeGameExe", exePath),
  getInstalledProtonTools: () => ipcRenderer.invoke("getInstalledProtonTools"),
  getProtonInstallDir: () => ipcRenderer.invoke("getProtonInstallDir"),
  removeProtonTool: (toolId: string, version: string) => ipcRenderer.invoke("removeProtonTool", toolId, version),
};
