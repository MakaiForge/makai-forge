import { registerEvent } from "../register-event";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const getLocalResource = async (
  _event: Electron.IpcMainInvokeEvent,
  filename: string
) => {
  const allowed = [
    "steam-user-tags.json",
    "steam-genres.json",
    "steam-publishers.json",
    "steam-developers.json",
  ];

  if (!allowed.includes(filename)) {
    throw new Error("Forbidden");
  }

  const dataDir = app.isPackaged
    ? path.join(process.resourcesPath, "app", "_data")
    : path.join(app.getAppPath(), "app", "_data");

  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
};

registerEvent("getLocalResource", getLocalResource);
