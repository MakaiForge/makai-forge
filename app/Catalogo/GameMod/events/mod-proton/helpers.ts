import os from "node:os";
import path from "node:path";

export async function findSteamAppIdFromGamePath(
  gamePath: string,
  steamPath: string,
  fs: typeof import("node:fs"),
  p: typeof import("node:path"),
): Promise<string | null> {
  if (!gamePath || !steamPath || !fs.existsSync(gamePath)) return null;

  const gameDirName = p.basename(gamePath);

  const libraryPaths: string[] = [steamPath];
  const libraryFoldersPath = p.join(steamPath, "steamapps", "libraryfolders.vdf");
  if (fs.existsSync(libraryFoldersPath)) {
    try {
      const vdfRaw = fs.readFileSync(libraryFoldersPath, "utf-8");
      const libMatch = vdfRaw.match(/"\d+"\s*\{[^}]*?"path"\s*"([^"]+)"/g);
      if (libMatch) {
        for (const entry of libMatch) {
          const pathMatch = entry.match(/"path"\s*"([^"]+)"/);
          if (pathMatch && fs.existsSync(pathMatch[1])) {
            libraryPaths.push(pathMatch[1]);
          }
        }
      }
    } catch {}
  }

  for (const libPath of libraryPaths) {
    const appsDir = p.join(libPath, "steamapps");
    if (!fs.existsSync(appsDir)) continue;
    let files: string[];
    try { files = fs.readdirSync(appsDir); } catch { continue; }

    for (const file of files) {
      const match = file.match(/^appmanifest_(\d+)\.acf$/i);
      if (!match) continue;
      try {
        const acfContent = fs.readFileSync(p.join(appsDir, file), "utf-8");
        const installdirMatch = acfContent.match(/"installdir"\s*"([^"]+)"/);
        if (installdirMatch && installdirMatch[1] === gameDirName) {
          const foundPath = p.join(libPath, "steamapps", "common", installdirMatch[1]);
          if (fs.existsSync(foundPath) && p.resolve(foundPath) === p.resolve(gamePath)) {
            return match[1];
          }
        }
      } catch {}
    }
  }

  return null;
}

export function findCompatibilityToolPath(protonName: string, steamPath: string, fs: typeof import("node:fs"), p: typeof import("node:path")): string | null {
  const candidates = [
    p.join(steamPath, "compatibilitytools.d", protonName),
    p.join(steamPath, "compatibilitytools.d", protonName.toLowerCase()),
  ];

  const home = process.env.HOME || os.homedir();
  const flatpakPath = p.join(home, ".steam", "root", "compatibilitytools.d", protonName);
  candidates.push(flatpakPath);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  const protonBase = p.join(steamPath, "compatibilitytools.d");
  if (fs.existsSync(protonBase)) {
    try {
      const entries = fs.readdirSync(protonBase);
      for (const entry of entries) {
        if (entry.toLowerCase().includes(protonName.toLowerCase().replace(/[^a-z0-9]/gi, "").toLowerCase())) {
          return p.join(protonBase, entry);
        }
      }
    } catch {}
  }

  return null;
}
