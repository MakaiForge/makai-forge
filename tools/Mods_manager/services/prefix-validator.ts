import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "@main/services";

export function resolvePrefixDir(prefixPath: string): string | null {
  if (!prefixPath) return null;
  prefixPath = prefixPath.replace(/^~($|\/)/, os.homedir() + "$1");
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) return prefixPath;
  if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) return path.join(prefixPath, "pfx");
  return null;
}

export function isValidPrefix(pfxPath: string): boolean {
  return (
    fs.existsSync(path.join(pfxPath, "user.reg")) &&
    fs.existsSync(path.join(pfxPath, "system.reg")) &&
    fs.existsSync(path.join(pfxPath, "drive_c")) &&
    fs.existsSync(path.join(pfxPath, "dosdevices"))
  );
}

export function cleanNestedPfx(pfxPath: string): void {
  const nested = path.join(pfxPath, "pfx");
  if (fs.existsSync(nested) && fs.existsSync(path.join(nested, "user.reg"))) {
    logger.warn(`Nested pfx directory detected at ${nested}, cleaning up`);
    try {
      fs.rmSync(nested, { recursive: true, force: true });
      logger.info(`Cleaned up nested pfx directory`);
    } catch (err) {
      logger.error(`Failed to clean nested pfx: ${err}`);
    }
  }
  const deepNested = path.join(pfxPath, "pfx", "pfx");
  if (fs.existsSync(deepNested)) {
    try {
      fs.rmSync(deepNested, { recursive: true, force: true });
    } catch {}
  }
}

export function dllOverridesMatch(prefixPath: string, required: Record<string, string>): boolean {
  const actualPfx = resolvePrefixDir(prefixPath);
  if (!actualPfx) return false;
  const userRegPath = path.join(actualPfx, "user.reg");
  if (!fs.existsSync(userRegPath)) return false;
  try {
    const content = fs.readFileSync(userRegPath, "utf-8");
    const sectionStart = content.indexOf("[Software\\\\Wine\\\\DllOverrides]");
    if (sectionStart < 0) return false;
    const sectionEnd = content.indexOf("\n[", sectionStart + 1);
    const section = sectionEnd >= 0
      ? content.slice(sectionStart, sectionEnd)
      : content.slice(sectionStart);
    for (const [dll, mode] of Object.entries(required)) {
      const search = `"${dll.toLowerCase()}"="${mode}"`;
      if (!section.includes(search)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
