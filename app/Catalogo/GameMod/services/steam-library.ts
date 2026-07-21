import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { findAllSteamLibraries } from "@container/core/steam-paths";

export function defaultStagingDir(gameId: string): string {
  const slug = gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
  return path.join(os.homedir(), "Games", "Mods", slug, "staging");
}

export function defaultPrefixDir(gameId: string): string {
  const slug = gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
  return path.join(os.homedir(), "Games", "Makai-forger", slug);
}

export function steamCompatDataPath(libraryPath: string, steamAppId: string): string | null {
  const compatData = path.join(libraryPath, "compatdata", steamAppId);
  return fs.existsSync(compatData) ? path.join(compatData, "pfx") : null;
}

export function findSteamAppPath(appId: string): { gamePath: string; libraryPath: string } | null {
  const libraries = findAllSteamLibraries();
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
