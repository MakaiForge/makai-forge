import fs from "node:fs";
import path from "node:path";
import type { ModStructure, ModFileEntry, ModCategory } from "./types";
import { detectWrappers, stripWrappers, findDeepestFomod } from "./detectors/wrapper-detector";
import { detectFomod, getFomodInfo } from "./detectors/fomod-detector";
import { scanStructure } from "./detectors/structure-detector";

export function analyzeMod(extractedDir: string): ModStructure {
  // First: check for FOMOD inside wrappers
  const fomodResult = findDeepestFomod(extractedDir);
  const hasFomod = !!fomodResult;

  let rootDir: string;
  let wrapperLevels: number;

  if (hasFomod) {
    rootDir = fomodResult!.rootDir;
    wrapperLevels = fomodResult!.wrapperLevels;
  } else {
    wrapperLevels = detectWrappers(extractedDir);
    rootDir = stripWrappers(extractedDir, wrapperLevels);
  }

  const scan = scanStructure(rootDir);
  const files = resolveFiles(rootDir, scan, hasFomod);
  const category = classifyMod(scan, hasFomod, rootDir);

  return {
    category,
    hasFomod,
    wrapperLevels,
    files,
    plugins: scan.plugins,
    archives: scan.archives,
    sksePlugins: scan.sksePlugins,
    hasData: scan.hasData,
  };
}

function collectFiles(rootDir: string, startDir: string, destBase: string, excludeDirs: Set<string>): ModFileEntry[] {
  const files: ModFileEntry[] = [];
  const seen = new Set<string>();

  function walk(currentDir: string, destPrefix: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (name === "fomod" || name === "src") continue;
      if (excludeDirs.has(name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = destPrefix ? path.join(destPrefix, entry.name) : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const key = relPath.replace(/\\/g, "/");
        if (!seen.has(key)) {
          seen.add(key);
          files.push({ source: fullPath, destination: relPath });
        }
      }
    }
  }

  walk(startDir, destBase);
  return files;
}

function resolveFiles(
  rootDir: string,
  scan: ReturnType<typeof scanStructure>,
  hasFomod: boolean
): ModFileEntry[] {
  if (hasFomod) return [];

  // Case 1: Has Data/ folder → map everything under Data/
  if (scan.hasData) {
    const dataDir = path.join(rootDir, "Data");
    const files = collectFiles(rootDir, dataDir, "", new Set(["skse"]));

    // SKSE/ at root maps to Data/SKSE/
    const skseRoot = path.join(rootDir, "SKSE");
    if (fs.existsSync(skseRoot)) {
      files.push(...collectFiles(rootDir, skseRoot, "SKSE", new Set()));
    }
    return files;
  }

  // Case 2: Has skse_loader.exe → script extender (root files + Data/)
  if (scan.hasSkseLoader) {
    const files: ModFileEntry[] = [];
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isFile()) {
        if (entry.name === "skse_loader.exe" || /\.dll$/i.test(entry.name)) {
          files.push({ source: fullPath, destination: entry.name });
        }
      }
      if (entry.isDirectory() && entry.name === "Data") {
        files.push(...collectFiles(rootDir, fullPath, "", new Set(["src"])));
      }
    }
    return files;
  }

  // Case 3: Everything else → assume goes to Data/
  const files = collectFiles(rootDir, rootDir, "", new Set(["skse"]));

  // SKSE/ plugins at root → Data/SKSE/
  const sksePath = path.join(rootDir, "SKSE");
  if (fs.existsSync(sksePath)) {
    files.push(...collectFiles(rootDir, sksePath, "SKSE", new Set()));
  }

  return files;
}

function classifyMod(
  scan: ReturnType<typeof scanStructure>,
  hasFomod: boolean,
  rootDir: string
): ModCategory {
  if (hasFomod) return "fomod";
  if (scan.hasSkseLoader) return "skse-loader";
  if (scan.hasSksePlugins) return "skse-plugin";

  // After stripping wrappers, if we land inside Data/, check if
  // the parent had Data structure
  if (scan.hasData) return "standard";

  // Root dir IS Data/ or has game files
  const dirName = path.basename(rootDir).toLowerCase();
  if (dirName === "data") return "standard";

  if (scan.plugins.length > 0) {
    // Loose .esp at root → goes to Data/
    const allUnderData = scan.plugins.every(p => p.startsWith("Data/") || !p.includes("/"));
    if (allUnderData) return "loose-plugin";
  }

  return "standard";
}
