import { BrowserWindow } from "electron";
import path from "node:path";
import { createSystemTray } from "./system-tray";
import icon from "@resources/icons/icon.png?asset";
import type { AuthPage } from "@shared";
import { createMainWindow } from "./window-manager/main-window";
import { openAuthWindow } from "./window-manager/auth-window";
import { openEditorWindow, closeEditorWindow } from "./window-manager/editor-window";
import {
  createGameLauncherWindow,
  showGameLauncherWindow,
  closeGameLauncherWindow,
} from "./window-manager/game-launcher";
import {
  createExecutableSelectWindow,
  showExecutableSelectWindow,
  closeExecutableSelectWindow,
  getPendingExecutableSelectData,
  clearPendingExecutableSelectData,
} from "./window-manager/executable-select";
import {
  createFolderSelectWindow,
  showFolderSelectWindow,
  closeFolderSelectWindow,
  getPendingFileSelectData,
  clearPendingFileSelectData,
} from "./window-manager/folder-select";
import { redirect, openMainWindow } from "./window-manager/redirect";
import {
  createGameLogWindow,
  showGameLogWindow,
  closeGameLogWindow,
} from "./window-manager/game-log";
export type { ExecutableSelectData, FileSelectData, FolderItem } from "./window-manager/types";

const INITIAL_CONFIG: Electron.BrowserWindowConstructorOptions = {
  width: 1200,
  height: 860,
  minWidth: 1024,
  minHeight: 860,
  backgroundColor: "#1c1c1c",
  titleBarStyle: process.platform === "linux" ? "default" : "hidden",
  icon,
  trafficLightPosition: { x: 16, y: 16 },
  titleBarOverlay: {
    symbolColor: "#DADBE1",
    color: "#00000000",
    height: 34,
  },
  webPreferences: {
    preload: path.join(__dirname, "../preload/index.mjs"),
    sandbox: false,
    webviewTag: true,
  },
  show: false,
};

export class WindowManager {
  public static mainWindow: Electron.BrowserWindow | null = null;
  public static setupWindow: Electron.BrowserWindow | null = null;
  public static notificationWindow: Electron.BrowserWindow | null = null;
  public static gameLauncherWindow: Electron.BrowserWindow | null = null;
  public static executableSelectWindow: Electron.BrowserWindow | null = null;
  public static folderSelectWindow: Electron.BrowserWindow | null = null;
  static gameLogWindow: Electron.BrowserWindow | null = null;
  static pendingExecutableSelectData: import("./window-manager/types").ExecutableSelectData | null = null;
  static pendingFileSelectData: import("./window-manager/types").FileSelectData | null = null;
  static readonly editorWindows: Map<string, BrowserWindow> = new Map();
  static initialConfigInitializationMainWindow = INITIAL_CONFIG;

  public static async createMainWindow() {
    await createMainWindow(WindowManager);
  }

  public static openAuthWindow(page: AuthPage, searchParams: URLSearchParams) {
    openAuthWindow(WindowManager, page, searchParams);
  }

  public static openEditorWindow(themeId: string) {
    openEditorWindow(WindowManager, themeId);
  }

  public static closeEditorWindow(themeId?: string) {
    closeEditorWindow(WindowManager, themeId);
  }

  public static async createGameLauncherWindow(shop: string, objectId: string) {
    await createGameLauncherWindow(WindowManager, shop, objectId);
  }

  public static createFolderSelectWindow(data: import("./window-manager/types").FileSelectData) {
    createFolderSelectWindow(WindowManager, data);
  }

  public static showFolderSelectWindow() {
    showFolderSelectWindow(WindowManager);
  }

  public static closeFolderSelectWindow() {
    closeFolderSelectWindow(WindowManager);
  }

  public static getPendingFileSelectData() {
    return getPendingFileSelectData(WindowManager);
  }

  public static clearPendingFileSelectData() {
    clearPendingFileSelectData(WindowManager);
  }

  public static showGameLauncherWindow() {
    showGameLauncherWindow(WindowManager);
  }

  public static closeGameLauncherWindow() {
    closeGameLauncherWindow(WindowManager);
  }

  public static createExecutableSelectWindow(data: import("./window-manager/types").ExecutableSelectData) {
    createExecutableSelectWindow(WindowManager, data);
  }

  public static showExecutableSelectWindow() {
    showExecutableSelectWindow(WindowManager);
  }

  public static closeExecutableSelectWindow() {
    closeExecutableSelectWindow(WindowManager);
  }

  public static getPendingExecutableSelectData() {
    return getPendingExecutableSelectData(WindowManager);
  }

  public static clearPendingExecutableSelectData() {
    clearPendingExecutableSelectData(WindowManager);
  }

  public static createGameLogWindow(shop: string, objectId: string) {
    createGameLogWindow(WindowManager, shop, objectId);
  }

  public static showGameLogWindow() {
    showGameLogWindow(WindowManager);
  }

  public static closeGameLogWindow() {
    closeGameLogWindow(WindowManager);
  }

  public static openMainWindow() {
    openMainWindow(WindowManager);
  }

  public static redirect(hash: string) {
    redirect(WindowManager, hash);
  }

  public static async createSystemTray(language: string) {
    await createSystemTray(WindowManager, language);
  }
}
