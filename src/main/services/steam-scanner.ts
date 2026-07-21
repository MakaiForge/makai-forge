import path from "node:path";
import fs from "node:fs";
import { logger } from "./logger";
import { findSteamClientPath, parseLibraryFolders } from "@container/core/steam-paths";

export interface SteamInstalledGame {
  appId: string;
  name: string;
  installDir: string;
  libraryPath: string;
  compatDataPath: string | null;
  hasPrefix: boolean;
  sizeOnDisk: number;
  executablePath: string | null;
}

const COMMON_EXE_DIRS = ["bin", "binaries", "Bin", "Binaries", "Win64", "win64"];
const EXE_EXTENSIONS = [".exe"];

function findGameExecutable(installPath: string): string | null {
  if (!fs.existsSync(installPath)) return null;
  try {
    const entries = fs.readdirSync(installPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
        return path.join(installPath, entry.name);
      }
    }
    for (const subDir of COMMON_EXE_DIRS) {
      const dirPath = path.join(installPath, subDir);
      if (!fs.existsSync(dirPath)) continue;
      const subEntries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of subEntries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
          return path.join(dirPath, entry.name);
        }
      }
    }
  } catch {}
  return null;
}

function parseAcf(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  const stack: { obj: Record<string, any>; key: string | null }[] = [{ obj: result, key: null }];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed === "{") continue;
    if (trimmed === "}") { stack.pop(); continue; }
    const quoteMatch = trimmed.match(/^"([^"]+)"\s+"([^"]*)"$/);
    if (quoteMatch) {
      stack[stack.length - 1].obj[quoteMatch[1]] = quoteMatch[2];
      continue;
    }
    const objMatch = trimmed.match(/^"([^"]+)"$/);
    if (objMatch) {
      const newObj: Record<string, any> = {};
      stack[stack.length - 1].obj[objMatch[1]] = newObj;
      stack.push({ obj: newObj, key: null });
    }
  }
  return result;
}

const NON_GAME_NAMES = [
  "proton", "steam linux runtime", "steamworks", "steamvr",
  "steam console", "steam beta", "steam audio",
];

function isGameApp(name: string, appId: string): boolean {
  const lower = name.toLowerCase();
  const knownAppIds = new Set([
    "1070560", "1391110", "1493710", "1586490",
    "1628350", "858280", "996510", "1161040", "1245040", "1283190",
    "1421260", "1494170", "1584720", "1640100",
    "228980", "250820", "480", "1826330",
  ]);
  if (knownAppIds.has(appId)) return false;
  if (NON_GAME_NAMES.some((kw) => lower.includes(kw))) return false;
  return true;
}

export async function scanSteamLibrary(): Promise<SteamInstalledGame[]> {
  const steamPath = findSteamClientPath();
  if (!steamPath || !fs.existsSync(steamPath)) {
    logger.warn("Steam not found");
    return [];
  }

  // Use centralized library path resolution from @prefix
  const steamappsPaths = parseLibraryFolders(steamPath);
  // Derive library roots from steamapps paths
  const libraryRoots = [...new Set(steamappsPaths.map(p => path.dirname(p)))];

  const games: SteamInstalledGame[] = [];
  const seenAppIds = new Set<string>();

  for (const libPath of libraryRoots) {
    const appsDir = path.join(libPath, "steamapps");
    if (!fs.existsSync(appsDir)) continue;

    let files: string[];
    try { files = fs.readdirSync(appsDir); } catch { continue; }

    for (const file of files) {
      const match = file.match(/^appmanifest_(\d+)\.acf$/i);
      if (!match) continue;
      const appId = match[1];
      if (seenAppIds.has(appId)) continue;
      seenAppIds.add(appId);

      try {
        const acf = parseAcf(fs.readFileSync(path.join(appsDir, file), "utf-8"));
        const state = acf.AppState;
        if (!state?.name || !state.installdir) continue;
        if (state.apptype === "Tool" || state.apptype === "Config") continue;
        if (!isGameApp(state.name, appId)) continue;

        const localCompat = path.join(libPath, "steamapps", "compatdata", appId);
        const mainCompat = path.join(steamPath, "steamapps", "compatdata", appId);
        const compatDataPath = fs.existsSync(localCompat) ? localCompat
          : fs.existsSync(mainCompat) ? mainCompat : null;

        const installPath = path.join(libPath, "steamapps", "common", state.installdir);

        games.push({
          appId,
          name: state.name,
          installDir: state.installdir,
          libraryPath: libPath,
          compatDataPath,
          hasPrefix: compatDataPath ? fs.existsSync(path.join(compatDataPath, "pfx")) : false,
          sizeOnDisk: parseInt(state.SizeOnDisk || "0", 10),
          executablePath: findGameExecutable(installPath),
        });
      } catch (err) {
        logger.error(`Failed to parse ${file}`, err);
      }
    }
  }

  return games.sort((a, b) => a.name.localeCompare(b.name));
}
