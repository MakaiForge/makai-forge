import fs from "node:fs";
import path from "node:path";

const KNOWN_GAME_DIRS = new Set([
  "data", "skse", "meshes", "textures", "sounds", "music",
  "scripts", "seq", "strings", "video", "interface", "shaders",
  "tools", "calientetools", "facegendata", "fomod",
]);

export function detectWrappers(extractedDir: string): number {
  let dir = extractedDir;
  let levels = 0;
  while (true) {
    const entries = fs.readdirSync(dir).filter(e => !e.startsWith("."));
    if (entries.length !== 1) break;

    const single = path.join(dir, entries[0]);
    if (!fs.statSync(single).isDirectory()) break;

    // Se a única pasta dentro é um diretório conhecido do jogo, não é wrapper
    if (KNOWN_GAME_DIRS.has(entries[0].toLowerCase())) break;

    dir = single;
    levels++;
  }
  return levels;
}

export function stripWrappers(extractedDir: string, levels: number): string {
  let dir = extractedDir;
  for (let i = 0; i < levels; i++) {
    const entries = fs.readdirSync(dir).filter(e => !e.startsWith("."));
    dir = path.join(dir, entries[0]);
  }
  return dir;
}

export function findDeepestFomod(extractedDir: string): { rootDir: string; wrapperLevels: number } | null {
  let dir = extractedDir;
  let levels = 0;
  while (true) {
    if (hasFomodSubdir(dir)) {
      return { rootDir: dir, wrapperLevels: levels };
    }
    const entries = fs.readdirSync(dir).filter(e => !e.startsWith("."));
    if (entries.length !== 1) break;
    const single = path.join(dir, entries[0]);
    if (!fs.statSync(single).isDirectory()) break;
    dir = single;
    levels++;
  }
  return null;
}

function hasFomodSubdir(dir: string): boolean {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some(e => e.isDirectory() && e.name.toLowerCase() === "fomod");
}
