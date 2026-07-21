import { BrowserWindow } from "electron";
import path from "node:path";
import { getCompatFlowDir } from "./cf-bridge";

export let compatWindow: BrowserWindow | null = null;

export function openCompatFlowWindow(filePath?: string) {
  if (compatWindow && !compatWindow.isDestroyed()) {
    compatWindow.focus();
    return;
  }

  const cfDir = getCompatFlowDir();
  const preloadPath = path.join(cfDir, "preload.js");
  const indexPath = path.join(cfDir, "renderer", "index.html");

  compatWindow = new BrowserWindow({
    width: 520,
    height: 440,
    minWidth: 420,
    minHeight: 360,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    titleBarStyle: "hidden",
    title: "CompatFlow",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(cfDir, "assets", "compatflow.png"),
  });

  compatWindow.loadFile(indexPath);
  compatWindow.webContents.openDevTools({ mode: "detach" });

  compatWindow.on("closed", () => {
    compatWindow = null;
  });

  if (filePath) {
    compatWindow.webContents.once("did-finish-load", () => {
      compatWindow?.webContents.send("file-opened", filePath);
    });
  }
}
