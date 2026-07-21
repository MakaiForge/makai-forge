import path from "node:path";
import { app } from "electron";

export function getCompatFlowDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "compatflow");
  }
  return path.join(app.getAppPath(), "data", "install-api", "CompactFlow");
}

export function cfBridgePath(name: string) {
  return path.join(getCompatFlowDir(), "bridge", name);
}

export function appPath(...segments: string[]) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.join(app.getAppPath(), ...segments);
}
