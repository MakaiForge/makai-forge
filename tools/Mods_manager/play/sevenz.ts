import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { execFileSync } from "node:child_process";

const BUNDLED_7Z_CANDIDATES = [
  path.join(app.getAppPath(), "data", "install-api", "7z", "7z"),
  path.join(app.getAppPath(), "resources", "data", "install-api", "7z", "7z"),
];

let _cached7zPath: string | null | undefined;

export function get7zPath(): string {
  if (_cached7zPath !== undefined) return _cached7zPath;

  for (const candidate of BUNDLED_7Z_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      _cached7zPath = candidate;
      return _cached7zPath;
    }
  }

  const system7z = "7z";
  try {
    execFileSync(system7z, ["--help"], { stdio: "pipe" });
    _cached7zPath = system7z;
    return _cached7zPath;
  } catch {
    // not available
  }

  _cached7zPath = "7z";
  return _cached7zPath;
}
