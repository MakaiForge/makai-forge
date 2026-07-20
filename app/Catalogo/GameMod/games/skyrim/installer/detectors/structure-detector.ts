import fs from "node:fs";
import path from "node:path";

const PLUGIN_EXTS = new Set([".esp", ".esm", ".esl"]);
const ARCHIVE_EXTS = new Set([".bsa", ".ba2"]);
const SKSE_DLL_PATTERN = /\.dll$/i;
const SKSE_LOADER_PATTERN = /^skse_loader\.exe$/i;
const BODYSLIDE_PATTERN = /[\\/]CalienteTools[\\/]BodySlide[\\/]/i;

export interface StructureScan {
  hasData: boolean;
  hasSkseLoader: boolean;
  hasSksePlugins: boolean;
  sksePlugins: string[];
  plugins: string[];
  archives: string[];
  bodyslideFiles: string[];
  fileTree: DirEntry[];
}

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children: DirEntry[];
}

export function scanStructure(rootDir: string): StructureScan {
  const result: StructureScan = {
    hasData: false,
    hasSkseLoader: false,
    hasSksePlugins: false,
    sksePlugins: [],
    plugins: [],
    archives: [],
    bodyslideFiles: [],
    fileTree: [],
  };

  if (!fs.existsSync(rootDir)) return result;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  result.hasData = entries.some(e => e.isDirectory() && e.name === "Data");

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const treeEntry: DirEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      children: [],
    };

    if (entry.isDirectory()) {
      treeEntry.children = scanDirectory(fullPath, fullPath, result);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const name = entry.name.toLowerCase();

      if (PLUGIN_EXTS.has(ext)) {
        result.plugins.push(entry.name);
      }
      if (ARCHIVE_EXTS.has(ext)) {
        result.archives.push(entry.name);
      }
      if (SKSE_LOADER_PATTERN.test(name)) {
        result.hasSkseLoader = true;
      }
    }

    result.fileTree.push(treeEntry);
  }

  // Scan for SKSE plugins inside SKSE/Plugins/
  const skseDir = path.join(rootDir, "SKSE");
  if (fs.existsSync(skseDir)) {
    const pluginsDir = path.join(skseDir, "Plugins");
    if (fs.existsSync(pluginsDir)) {
      const pluginFiles = fs.readdirSync(pluginsDir);
      const dllFiles = pluginFiles.filter(f => SKSE_DLL_PATTERN.test(f));
      if (dllFiles.length > 0) {
        result.hasSksePlugins = true;
        result.sksePlugins = dllFiles;
      }
    }
  }

  // Scan for bodyslide files
  scanBodyslide(rootDir, result);

  return result;
}

function scanDirectory(baseDir: string, currentDir: string, result: StructureScan): DirEntry[] {
  const entries: DirEntry[] = [];
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const entry of items) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    const treeEntry: DirEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      children: [],
    };

    if (entry.isDirectory()) {
      treeEntry.children = scanDirectory(baseDir, fullPath, result);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (PLUGIN_EXTS.has(ext)) {
        result.plugins.push(relPath);
      }
      if (ARCHIVE_EXTS.has(ext)) {
        result.archives.push(relPath);
      }
    }

    entries.push(treeEntry);
  }

  return entries;
}

function scanBodyslide(dir: string, result: StructureScan): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "CalienteTools") {
        const bsDir = path.join(fullPath, "BodySlide");
        if (fs.existsSync(bsDir)) {
          collectFiles(bsDir, result.bodyslideFiles);
        }
      }
      scanBodyslide(fullPath, result);
    }
  }
}

function collectFiles(dir: string, files: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
}
