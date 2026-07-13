import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const GOG_SEARCH_DIRS = [
  "GOG Games",
  "GOG",
  "Games",
];

function getGogSearchRoots(): string[] {
  const home = os.homedir();
  return GOG_SEARCH_DIRS.map(d => path.join(home, d));
}

function scanForExe(dir: string, exes: string[]): string | null {
  if (!fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (!fs.statSync(full).isDirectory()) continue;
      for (const exe of exes) {
        if (fs.existsSync(path.join(full, exe))) {
          return full;
        }
      }
    }
  } catch {}
  return null;
}

function scanSubdirs(dir: string, exes: string[]): string | null {
  if (!fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const sub = path.join(dir, entry);
      if (!fs.statSync(sub).isDirectory()) continue;
      const found = scanForExe(sub, exes);
      if (found) return found;
    }
  } catch {}
  return null;
}

function detectGogByExe(gameId: string, detectExe: string, detectExeAlts?: string[]): string | null {
  const exes = [detectExe, ...(detectExeAlts || [])];
  const searchRoots = getGogSearchRoots();

  for (const root of searchRoots) {
    const found = scanForExe(root, exes);
    if (found) return found;
  }

  for (const root of searchRoots) {
    const found = scanSubdirs(root, exes);
    if (found) return found;
  }

  const home = os.homedir();
  const extraRoots = [
    path.join(home, ".local", "share"),
    "/mnt",
    "/media",
  ];
  for (const root of extraRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root);
      for (const entry of entries) {
        const sub = path.join(root, entry);
        if (!fs.statSync(sub).isDirectory()) continue;
        const found = scanForExe(sub, exes);
        if (found) return found;
        const foundDeep = scanSubdirs(sub, exes);
        if (foundDeep) return foundDeep;
      }
    } catch {}
  }

  return null;
}

function detectGogByKeyword(gameId: string, gameName?: string): string | null {
  const keywords: string[] = [];
  if (gameName) {
    keywords.push(...gameName.toLowerCase().split(/[\s:]+/).filter(w => w.length > 3));
  }
  keywords.push(gameId.replace(/_/g, " ").toLowerCase());

  const searchRoots = getGogSearchRoots();
  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root);
      for (const entry of entries) {
        const full = path.join(root, entry);
        if (!fs.statSync(full).isDirectory()) continue;
        const lower = entry.toLowerCase();
        if (keywords.some(kw => lower.includes(kw))) {
          return full;
        }
      }
    } catch {}
  }
  return null;
}

export function findGogGamePath(
  gameId: string,
  gameName?: string,
  detectExe?: string,
  detectExeAlts?: string[],
): { gamePath: string; source: "gog" } | null {
  if (detectExe) {
    const found = detectGogByExe(gameId, detectExe, detectExeAlts);
    if (found) return { gamePath: found, source: "gog" };
  }

  const found = detectGogByKeyword(gameId, gameName);
  if (found) return { gamePath: found, source: "gog" };

  return null;
}

export function isGogGame(gamePath: string): boolean {
  if (fs.existsSync(path.join(gamePath, "steam_api64.dll"))) return false;
  if (fs.existsSync(path.join(gamePath, "steam_api.dll"))) return false;
  try {
    const entries = fs.readdirSync(gamePath);
    if (entries.some(e => /^goggame-.+\.id$/.test(e))) return true;
  } catch {}
  return false;
}
