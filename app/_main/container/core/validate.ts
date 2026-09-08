import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "@main/services";
import { logCall } from "../activity-logger";

/**
 * Expands ~/ and ~user/ in a path to the full home directory path.
 * Also normalizes the path (resolves . and ..).
 */
export function normalizePrefixPath(p: string): string {
  if (!p) return p;
  if (p.startsWith("~" + path.sep) || p === "~") {
    return path.resolve(path.join(os.homedir(), p.slice(1)));
  }
  return path.resolve(p);
}

export interface ValidationResult {
  valid: boolean
  hasDriveC: boolean
  hasDosDevices: boolean
  hasSystemReg: boolean
  hasUserReg: boolean
}

/**
 * Check if a prefix directory is a valid Wine/Proton prefix.
 */
export function validatePrefix(prefixPath: string): ValidationResult {
  const _start = Date.now();
  prefixPath = normalizePrefixPath(prefixPath);
  const result: ValidationResult = {
    valid: false,
    hasDriveC: false,
    hasDosDevices: false,
    hasSystemReg: false,
    hasUserReg: false,
  };

  if (!prefixPath || !fs.existsSync(prefixPath)) {
    logCall("validate", "validatePrefix", { prefixPath }, result, Date.now() - _start);
    return result;
  }

  result.hasDriveC = fs.existsSync(path.join(prefixPath, "drive_c"));
  result.hasDosDevices = fs.existsSync(path.join(prefixPath, "dosdevices"));
  result.hasSystemReg = fs.existsSync(path.join(prefixPath, "system.reg"));
  result.hasUserReg = fs.existsSync(path.join(prefixPath, "user.reg"));
  result.valid = result.hasDriveC && result.hasUserReg;

  logCall("validate", "validatePrefix", { prefixPath }, result, Date.now() - _start);
  return result;
}

/**
 * Ensure a prefix directory exists with basic structure.
 * Creates minimal Proton-compatible prefix if missing.
 */
export function ensurePrefixDir(prefixPath: string): string | null {
  const _start = Date.now();
  prefixPath = normalizePrefixPath(prefixPath);
  if (!prefixPath) {
    logCall("validate", "ensurePrefixDir", { prefixPath }, { result: null }, 0);
    return null;
  }
  // Check root path first (direct Wine prefix), then pfx/ subpath (compatdata layout)
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) {
    logCall("validate", "ensurePrefixDir", { prefixPath }, { result: prefixPath }, Date.now() - _start);
    return prefixPath;
  }
  if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) {
    const pfx = path.join(prefixPath, "pfx");
    logCall("validate", "ensurePrefixDir", { prefixPath }, { result: pfx }, Date.now() - _start);
    return pfx;
  }

  // Create new prefix using direct Wine layout (no pfx/ subdir)
  if (!fs.existsSync(prefixPath)) {
    fs.mkdirSync(prefixPath, { recursive: true });
  }

  const userReg = path.join(prefixPath, "user.reg");
  if (!fs.existsSync(userReg)) {
    fs.writeFileSync(userReg, "WINE REGISTRY Version 2\n", "utf-8");
    logger.info(`Created minimal prefix marker at ${userReg}`);
  }

  logCall("validate", "ensurePrefixDir", { prefixPath }, { result: prefixPath }, Date.now() - _start);
  return prefixPath;
}
