import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { ModlistEntry } from "@types";
import { SE_REGEXES } from "./bethesda-constants";

export const ROOT_PLUGIN_EXTS = new Set([".esp", ".esm", ".esl"]);

/**
 * Normalize Windows backslashes to forward slashes and resolve . and ..
 */
export function normalizeWindowsPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * Find a file in a directory with case-insensitive matching.
 * Returns the actual path with correct casing, or null if not found.
 */
export function resolveCaseInsensitive(dir: string, relativePath: string): string | null {
  const parts = normalizeWindowsPath(relativePath).split("/");
  let current = dir;

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      current = path.dirname(current);
      continue;
    }

    let found = false;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (entry.name.toLowerCase() === part.toLowerCase()) {
        current = path.join(current, entry.name);
        found = true;
        break;
      }
    }

    if (!found) return null;
  }

  return current;
}

/**
 * Normalize path casing for case-sensitive games (Cyberpunk, Stardew Valley).
 * Uses the canonical casing from the actual filesystem if available,
 * otherwise lowercases the entire path.
 */
export function normalizePathCasing(
  relativePath: string,
  basePath: string,
  mode: "lower" | "preserve" = "lower",
): string {
  if (mode === "preserve") return normalizeWindowsPath(relativePath);

  const normalized = normalizeWindowsPath(relativePath);
  const parts = normalized.split("/");

  // Try to resolve each part against the actual filesystem
  let current = basePath;
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolved.push("..");
      current = path.dirname(current);
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      // Can't read dir — use lowercase as fallback
      resolved.push(part.toLowerCase());
      continue;
    }

    const match = entries.find(e => e.name.toLowerCase() === part.toLowerCase());
    if (match) {
      resolved.push(match.name);
      current = path.join(current, match.name);
    } else {
      resolved.push(part.toLowerCase());
    }
  }

  return resolved.join("/");
}

export function stripDataPrefix(relativePath: string): string {
  const parts = relativePath.split(path.sep);
  if (parts.length > 0 && parts[0].toLowerCase() === "data") {
    return parts.slice(1).join(path.sep);
  }
  return relativePath;
}

const KNOWN_DATA_FOLDERS = new Set([
  "meshes", "textures", "scripts", "sounds", "music", "interface",
  "materials", "particles", "grass", "landscape", "trees", "clutter",
  "programs", "strings", "video", "skse", "calientetools", "fnis",
]);

function stripWrapperFolders(relativePath: string, modName: string): string {
  let result = stripDataPrefix(relativePath);
  const modNameLower = modName.toLowerCase();
  const resultParts = result.split(path.sep);
  if (resultParts.length > 0 && resultParts[0].toLowerCase() === modNameLower) {
    result = resultParts.slice(1).join(path.sep);
  }
  const finalParts = result.split(path.sep);
  if (finalParts.length > 1 && !KNOWN_DATA_FOLDERS.has(finalParts[0].toLowerCase())) {
    const secondLower = finalParts[1].toLowerCase();
    if (KNOWN_DATA_FOLDERS.has(secondLower) || secondLower === "calientetools") {
      result = finalParts.slice(1).join(path.sep);
    }
  }
  return result;
}

export interface WalkDirOptions {
  skipDotfiles?: boolean;
}

export function walkDir(
  dir: string,
  callback: (fullPath: string, relativePath: string) => void,
  options?: WalkDirOptions
): void {
  const walk = (currentDir: string, relativePrefix: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (options?.skipDotfiles && entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      const rawRelative = relativePrefix
        ? path.join(relativePrefix, entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, rawRelative);
      } else if (entry.isFile()) {
        callback(fullPath, rawRelative);
      }
    }
  };
  walk(dir, "");
}

export function walkDirWithDirs(
  dir: string,
  callbacks: {
    onFile: (fullPath: string, relativePath: string) => void;
    onDir?: (fullPath: string, relativePath: string, dirName: string) => void;
  },
  options?: WalkDirOptions
): void {
  const walk = (currentDir: string, relativePrefix: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (options?.skipDotfiles && entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      const rawRelative = relativePrefix
        ? path.join(relativePrefix, entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        callbacks.onDir?.(fullPath, rawRelative, entry.name);
        walk(fullPath, rawRelative);
      } else if (entry.isFile()) {
        callbacks.onFile(fullPath, rawRelative);
      }
    }
  };
  walk(dir, "");
}

export const STAGING_BASE = path.join(
  process.env.HOME || os.homedir(),
  ".local", "share", "protonforge", "mods", "staging"
);

export function getStagingDir(gameId: string): string {
  return path.join(STAGING_BASE, gameId);
}

export function findStagingDir(baseDir: string, modName: string): string | null {
  const candidate = path.join(baseDir, modName);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

export function findPrefixUsername(prefixPath: string): string | null {
  const usersDir = path.join(prefixPath, "drive_c", "users");
  if (!fs.existsSync(usersDir)) return null;
  const skip = new Set(["public", "default", "all users", "default user"]);
  const dirs = fs.readdirSync(usersDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !skip.has(d.name.toLowerCase()))
    .map(d => d.name);
  if (dirs.length === 1) return dirs[0];

  const userReg = path.join(prefixPath, "user.reg");
  if (fs.existsSync(userReg)) {
    const text = fs.readFileSync(userReg, "utf-8");
    const m = text.match(/"AppData"=str\(2\):"C:\\\\users\\\\([^\\\\]+)\\\\/);
    if (m) return m[1];
  }
  return dirs[0] || null;
}

export interface BuildFilemapOptions {
  /** Skip stripping wrapper folders (Data/, mod name, etc.) — used by Stardew Valley */
  preserveModFolder?: boolean;
  /** Case normalization mode for destination paths: "lower" = lowercase all, "preserve" = keep as-is */
  casingMode?: "lower" | "preserve";
}

export async function buildFilemap(
  modlist: ModlistEntry[],
  stagingDir: string,
  _gamePath: string,
  options?: BuildFilemapOptions,
): Promise<Record<string, string>> {
  const filemap: Record<string, string> = {};
  const casingMode = options?.casingMode || "preserve";

  const enabledMods = modlist
    .filter((m) => m.enabled && !m.isSeparator)
    .map((m) => m.name);

  for (const modName of enabledMods) {
    const modStaging = findStagingDir(stagingDir, modName);
    if (!modStaging) continue;

    walkDir(modStaging, (fullPath, relativePath) => {
      // Normalize Windows backslashes
      let normalizedPath = normalizeWindowsPath(relativePath);

      if (options?.preserveModFolder) {
        // Stardew Valley: deploy as-is, keeping mod name in path
        filemap[normalizedPath] = fullPath;
      } else {
        const stripped = stripWrapperFolders(relativePath, modName);
        if (stripped && stripped !== "." && stripped !== relativePath) {
          normalizedPath = normalizeWindowsPath(stripped);
          filemap[normalizedPath] = fullPath;
        } else {
          filemap[normalizedPath] = fullPath;
        }
      }
    }, { skipDotfiles: true });
  }

  // Apply case normalization for case-sensitive games
  if (casingMode === "lower") {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(filemap)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  return filemap;
}

export async function buildPluginFilemap(
  modlist: ModlistEntry[],
  stagingDir: string,
  _gamePath: string
): Promise<Record<string, string>> {
  const filemap: Record<string, string> = {};

  const enabledMods = modlist
    .filter((m) => m.enabled && !m.isSeparator)
    .map((m) => m.name);

  for (const modName of enabledMods) {
    const modStaging = path.join(stagingDir, modName);
    if (!fs.existsSync(modStaging)) continue;

    walkDir(modStaging, (fullPath, relativePath) => {
      const parts = relativePath.split(path.sep);
      const isRoot = parts.length === 1;
      if (isRoot) {
        const fileName = parts[0];
        const ext = path.extname(fileName).toLowerCase();
        const isPlugin = ROOT_PLUGIN_EXTS.has(ext);
        const isSE = SE_REGEXES.some(p => p.test(fileName))
          && (ext === ".exe" || ext === ".dll");
        if (!isPlugin && !isSE) return;
      }
      const strippedPath = stripWrapperFolders(relativePath, modName);
      filemap[strippedPath] = fullPath;
    });
  }

  return filemap;
}
