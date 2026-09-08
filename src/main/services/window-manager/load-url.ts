import { is } from "@electron-toolkit/utils";
import type { BrowserWindow } from "electron";
import { app } from "electron";
import path from "node:path";
import { logger } from "../logger";

const RENDERER_HTML = path.join(__dirname, "../renderer/index.html");

function formatVersionNumber(version: string) {
  return version.replaceAll(".", "-");
}

export async function loadWindowURL(window: BrowserWindow, hash: string = "") {
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/${hash}`);
  } else if (import.meta.env.MAIN_VITE_LAUNCHER_SUBDOMAIN) {
    try {
      await window.loadURL(
        `https://release-v${formatVersionNumber(app.getVersion())}.${import.meta.env.MAIN_VITE_LAUNCHER_SUBDOMAIN}#/${hash}`
      );
    } catch (error) {
      logger.error(
        "Failed to load from MAIN_VITE_LAUNCHER_SUBDOMAIN, falling back to local file:",
        error
      );
      window.loadFile(RENDERER_HTML, { hash });
    }
  } else {
    window.loadFile(RENDERER_HTML, { hash });
  }
}
