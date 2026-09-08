import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const BUNDLED_7Z_CANDIDATES = [
  path.join(app.getAppPath(), "app", "_resources", "binaries", "7z", "7zz"),
  path.join(app.getAppPath(), "app", "_resources", "binaries", "7zzs"),
];

let _cached7zPath: string | null | undefined;

export function get7zPath(): string {
  if (_cached7zPath !== undefined) return _cached7zPath as string;

  for (const candidate of BUNDLED_7Z_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      _cached7zPath = candidate;
      return _cached7zPath;
    }
  }

  _cached7zPath = "7z";
  return _cached7zPath;
}
