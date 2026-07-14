import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

/**
 * Resolve the project's venv Python path.
 * Works in both dev and packaged mode.
 */
export function getVenvPythonPath(): string | null {
  const venvDir = app.isPackaged
    ? path.join(process.resourcesPath, "venv")
    : path.join(app.getAppPath(), "tools", "venv");

  const candidates = [
    path.join(venvDir, "bin", "python3"),
    path.join(venvDir, "bin", "python"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Get the tools/prefix/python directory path for PYTHONPATH manipulation.
 */
export function getPrefixPythonDir(): string {
  return path.join(app.getAppPath(), "tools", "prefix", "python");
}
