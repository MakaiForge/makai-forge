import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { app } from "electron";
import { logger } from "@main/services";

/**
 * Parse libraryfolders.vdf to find ALL Steam library paths.
 */
export function parseLibraryFolders(steamPath: string): string[] {
  const paths: string[] = [path.join(steamPath, "steamapps")];
  const vdfPath = path.join(steamPath, "steamapps", "libraryfolders.vdf");
  if (!fs.existsSync(vdfPath)) return paths;
  try {
    const raw = fs.readFileSync(vdfPath, "utf-8");
    const regex = /"path"\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      const libPath = match[1];
      if (fs.existsSync(libPath)) {
        paths.push(path.join(libPath, "steamapps"));
      }
    }
  } catch (err) {
    logger.error("Failed to parse libraryfolders.vdf", err);
  }
  return paths;
}

/**
 * Convenience wrapper: parse all Steam libraries across known Steam installations.
 * Combines VDF parsing with known default paths as fallback.
 */
const KNOWN_STEAM_LIBRARIES = [
  path.join(os.homedir(), ".local", "share", "Steam", "steamapps"),
  path.join(os.homedir(), ".steam", "steam", "steamapps"),
  "/usr/share/steam/steamapps",
  path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", "data", "steam", "steamapps"),
  path.join(os.homedir(), "snap", "steam", "common", ".local", "share", "Steam", "steamapps"),
];

export function findAllSteamLibraries(): string[] {
  const libraries: string[] = [];
  const vdfPaths = [
    path.join(os.homedir(), ".steam", "steam", "steamapps", "libraryfolders.vdf"),
    path.join(os.homedir(), ".local", "share", "Steam", "steamapps", "libraryfolders.vdf"),
    path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", "data", "steam", "steamapps", "libraryfolders.vdf"),
    path.join(os.homedir(), "snap", "steam", "common", ".local", "share", "Steam", "steamapps", "libraryfolders.vdf"),
  ];

  for (const vdfPath of vdfPaths) {
    if (!fs.existsSync(vdfPath)) continue;
    try {
      const content = fs.readFileSync(vdfPath, "utf-8");
      const pathRegex = /"path"\s+"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = pathRegex.exec(content)) !== null) {
        const libPath = match[1].trim();
        const steamappsPath = path.join(libPath, "steamapps");
        if (fs.existsSync(steamappsPath) && !libraries.includes(steamappsPath)) {
          libraries.push(steamappsPath);
        }
      }
    } catch { continue; }
  }

  for (const def of KNOWN_STEAM_LIBRARIES) {
    if (fs.existsSync(def) && !libraries.includes(def)) {
      libraries.push(def);
    }
  }

  return libraries;
}

/**
 * Find a Proton binary by name across all known compatibility tools directories.
 */
export function findProtonPath(protonName: string): string | null {
  const searchRoots = [
    path.join(app.getPath("userData"), "compat-tools", "compatibilitytools.d"),
    path.join(os.homedir(), ".steam", "steam", "compatibilitytools.d"),
    "/usr/share/steam/compatibilitytools.d",
  ];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === protonName) {
          const candidate = path.join(root, entry.name, "proton");
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch { continue; }
  }

  // Fallback: search by partial name match
  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const lowerEntry = entry.name.toLowerCase();
        const lowerProton = protonName.toLowerCase();
        if (lowerEntry.includes(lowerProton) || lowerProton.includes(lowerEntry)) {
          const candidate = path.join(root, entry.name, "proton");
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch { continue; }
  }

  return null;
}

/**
 * Find the Steam client installation path.
 */
export function findSteamClientPath(): string {
  const candidates = [
    path.join(os.homedir(), ".local", "share", "Steam"),
    path.join(os.homedir(), ".steam", "steam"),
    "/usr/share/steam",
    path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", "data", "steam"),
    path.join(os.homedir(), "snap", "steam", "common", ".local", "share", "Steam"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "steam.sh")) || fs.existsSync(path.join(p, "steam"))) {
      return p;
    }
  }
  return candidates[0];
}

/**
 * Find a Steam game by appId across all Steam libraries.
 */
export function findSteamAppPath(appId: string): { gamePath: string; libraryPath: string } | null {
  const libraries = parseLibraryFolders(findSteamClientPath());

  for (const lib of libraries) {
    const manifest = path.join(lib, `appmanifest_${appId}.acf`);
    if (!fs.existsSync(manifest)) continue;
    try {
      const content = fs.readFileSync(manifest, "utf-8");
      const match = content.match(/"installdir"\s*"([^"]+)"/);
      if (match) {
        const gamePath = path.join(lib, "common", match[1]);
        if (fs.existsSync(gamePath)) {
          return { gamePath, libraryPath: lib };
        }
      }
    } catch { continue; }
  }
  return null;
}

/**
 * Find compatdata/<appId>/pfx across all Steam libraries.
 */
export function findCompatData(appId: string): string | null {
  const libraries = parseLibraryFolders(findSteamClientPath());
  for (const lib of libraries) {
    const pfx = path.join(lib, "compatdata", appId, "pfx");
    if (fs.existsSync(pfx)) return pfx;
  }
  return null;
}
