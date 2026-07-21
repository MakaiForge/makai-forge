import icon from "@assets/assets/icons/app/icon.png?asset";
import { BrowserWindow, app } from "electron";
import { isStaging } from "@main/constants";
import type { WindowManager } from "../window-manager";
import { loadWindowURL } from "./load-url";

export function openEditorWindow(wm: typeof WindowManager, themeId: string) {
  if (!wm.mainWindow) return;

  const existingWindow = wm.editorWindows.get(themeId);
  if (existingWindow) {
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.focus();
    return;
  }

  const editorWindow = new BrowserWindow({
    width: 720,
    height: 720,
    minWidth: 600,
    minHeight: 540,
    backgroundColor: "#1c1c1c",
    titleBarStyle: process.platform === "linux" ? "default" : "hidden",
    icon,
    trafficLightPosition: { x: 16, y: 16 },
    titleBarOverlay: {
      symbolColor: "#DADBE1",
      color: "#151515",
      height: 34,
    },
    webPreferences: {
      preload: require("node:path").join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
    show: false,
  });

  wm.editorWindows.set(themeId, editorWindow);

  editorWindow.removeMenu();
  loadWindowURL(editorWindow, `theme-editor?themeId=${themeId}`);

  const openDevToolsInDev = process.env.OPEN_DEVTOOLS === "true";
  editorWindow.once("ready-to-show", () => {
    editorWindow.show();
    if (openDevToolsInDev) wm.mainWindow?.webContents.openDevTools();
    if ((!app.isPackaged || isStaging) && openDevToolsInDev) {
      editorWindow.webContents.openDevTools();
    }
  });

  editorWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.key === "F12") {
      wm.mainWindow?.webContents.toggleDevTools();
    }
  });

  editorWindow.on("close", () => {
    wm.mainWindow?.webContents.closeDevTools();
    wm.editorWindows.delete(themeId);
  });
}

export function closeEditorWindow(wm: typeof WindowManager, themeId?: string) {
  if (themeId) {
    const editorWindow = wm.editorWindows.get(themeId);
    if (editorWindow) editorWindow.close();
  } else {
    wm.editorWindows.forEach((editorWindow) => editorWindow.close());
  }
}
