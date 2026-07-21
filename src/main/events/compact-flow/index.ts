import { app } from "electron";
import path from "node:path";

const cfDir = app.isPackaged
  ? path.join(process.resourcesPath, "app", "_resources", "compact-flow")
  : path.join(app.getAppPath(), "app", "_resources", "compact-flow");

require(path.join(cfDir, "main", "ipc", "analyze"));
require(path.join(cfDir, "main", "ipc", "catalog"));
require(path.join(cfDir, "main", "ipc", "proton"));
require(path.join(cfDir, "main", "ipc", "install"));
require(path.join(cfDir, "main", "ipc", "icon"));
require(path.join(cfDir, "main", "ipc", "logger"));
