import fs from "node:fs";
import path from "node:path";
import type { ModlistEntry, DeploymentResult } from "@types";
import type { CustomRule, LinkMode } from "../_shared/types";
import { buildFilemap, findPrefixUsername } from "../_shared/filemap";
import { scanSymlinks, linkAll, restoreSymlinks } from "../_shared/symlink";
import { pluginsTxtPath, collectPlugins } from "./bethesda-plugins";

export function moveToCore(dataDir: string, log?: (msg: string) => void): void {
  const coreDir = dataDir + "_Core";
  if (fs.existsSync(coreDir)) {
    fs.rmSync(coreDir, { recursive: true, force: true });
  }
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    return;
  }
  fs.renameSync(dataDir, coreDir);
  fs.mkdirSync(dataDir, { recursive: true });
  log?.(`  Moved Data/ → Data_Core/`);
}

export function restoreCore(dataDir: string, _overwriteDir?: string, log?: (msg: string) => void): number {
  const coreDir = dataDir + "_Core";
  if (!fs.existsSync(coreDir)) {
    log?.("  Data_Core/ not found — skipping restore");
    return 0;
  }
  let restored = 0;
  const walk = (src: string, dest: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        walk(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        restored++;
      }
    }
  };
  walk(coreDir, dataDir);
  fs.rmSync(coreDir, { recursive: true, force: true });
  log?.(`  Restored ${restored} files from Data_Core/`);
  return restored;
}

export function symlinkPluginsTxt(
  pluginsPath: string,
  sourcePluginsTxt: string,
  log?: (msg: string) => void,
): void {
  if (!fs.existsSync(sourcePluginsTxt)) {
    log?.(`  plugins.txt not found at ${sourcePluginsTxt} — skipping`);
    return;
  }
  fs.mkdirSync(path.dirname(pluginsPath), { recursive: true });
  if (fs.existsSync(pluginsPath) || fs.lstatSync(pluginsPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    try { fs.unlinkSync(pluginsPath); } catch { /* */ }
  }
  if (fs.existsSync(pluginsPath)) {
    try { fs.renameSync(pluginsPath, `${pluginsPath}.bak`); } catch { /* */ }
  }
  try {
    fs.symlinkSync(sourcePluginsTxt, pluginsPath);
    log?.(`  Symlinked plugins.txt → ${pluginsPath}`);
  } catch (err) {
    log?.(`  Failed to symlink plugins.txt: ${err}`);
  }
}

export function removePluginsTxtSymlink(pluginsPath: string, log?: (msg: string) => void): void {
  try {
    if (fs.existsSync(pluginsPath) && fs.lstatSync(pluginsPath).isSymbolicLink()) {
      fs.unlinkSync(pluginsPath);
      log?.(`  Removed plugins.txt symlink`);
    }
  } catch { /* */ }
}

export function symlinkIniFiles(
  iniDir: string,
  myGamesDir: string,
  log?: (msg: string) => void,
): void {
  if (!fs.existsSync(iniDir)) {
    fs.mkdirSync(iniDir, { recursive: true });
    log?.(`  Created INI files directory: ${iniDir}`);
    return;
  }
  const iniFiles = fs.readdirSync(iniDir).filter(f => f.toLowerCase().endsWith(".ini"));
  if (iniFiles.length === 0) return;

  fs.mkdirSync(myGamesDir, { recursive: true });
  for (const file of iniFiles) {
    const src = path.join(iniDir, file);
    const target = path.join(myGamesDir, file);
    if (fs.existsSync(target) || fs.existsSync(target)) {
      try { fs.unlinkSync(target); } catch { /* */ }
    }
    try { fs.symlinkSync(src, target); log?.(`  Symlinked ${file} → ${target}`); }
    catch { /* */ }
  }
}

export function removeIniSymlinks(
  iniDir: string,
  myGamesDir: string,
  log?: (msg: string) => void,
): void {
  if (!fs.existsSync(iniDir) || !fs.existsSync(myGamesDir)) return;
  for (const file of fs.readdirSync(iniDir).filter(f => f.toLowerCase().endsWith(".ini"))) {
    const target = path.join(myGamesDir, file);
    try {
      if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
        fs.unlinkSync(target);
        log?.(`  Removed INI symlink: ${file}`);
      }
    } catch { /* */ }
  }
}

export function symlinkProfileSaves(
  profileSavesDir: string,
  myGamesDir: string,
  log?: (msg: string) => void,
): void {
  const savesLink = path.join(myGamesDir, "Saves");
  fs.mkdirSync(profileSavesDir, { recursive: true });
  if (fs.existsSync(savesLink) || fs.existsSync(savesLink)) {
    try { fs.unlinkSync(savesLink); } catch { /* */ }
  }
  try {
    fs.symlinkSync(profileSavesDir, savesLink);
    log?.(`  Symlinked Saves → ${profileSavesDir}`);
  } catch { /* */ }
}

export function removeProfileSavesSymlink(
  myGamesDir: string,
  log?: (msg: string) => void,
): void {
  const savesLink = path.join(myGamesDir, "Saves");
  try {
    if (fs.existsSync(savesLink) && fs.lstatSync(savesLink).isSymbolicLink()) {
      fs.unlinkSync(savesLink);
      log?.(`  Removed Saves symlink`);
    }
  } catch { /* */ }
}

export async function deployFilemap(
  dataDir: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  gamePath: string,
  customRules?: CustomRule[],
  mode?: LinkMode,
  prefixPath?: string,
  log?: (msg: string) => void,
): Promise<DeploymentResult> {
  const effectiveMode: LinkMode = mode || "symlink";
  const filemap = await buildFilemap(modlist, stagingDir, gamePath);

  const preExistingData = fs.existsSync(dataDir) ? scanSymlinks(dataDir) : {};
  log?.(`  Saved ${Object.keys(preExistingData).length} pre-existing symlinks`);

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const count = linkAll(filemap, dataDir, effectiveMode);
    log?.(`  Created ${count} ${effectiveMode === "symlink" ? "symlinks" : effectiveMode === "hardlink" ? "hardlinks" : "copies"} in Data/`);

    if (customRules) {
      for (const rule of customRules) {
        await applyCustomRule(rule, filemap, modlist, stagingDir, gamePath, log, prefixPath, path.basename(dataDir));
      }
    }

    return { success: true, log: [], filemap };
  } catch (err) {
    log?.(`  Deploy failed: ${err}. Rolling back...`);
    const filemapPaths = Object.keys(filemap);
    for (const relPath of filemapPaths) {
      const target = path.join(dataDir, relPath);
      try {
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
          fs.unlinkSync(target);
        }
      } catch { /* */ }
    }
    restoreSymlinks(preExistingData, dataDir);
    return { success: false, log: [], filemap: {} };
  }
}

async function applyCustomRule(
  rule: CustomRule,
  filemap: Record<string, string>,
  _modlist: ModlistEntry[],
  _stagingDir: string,
  gamePath: string,
  log?: (msg: string) => void,
  prefixPath?: string,
  cleanupDir?: string,
): Promise<void> {
  const { dest, filenames, extensions, folders, flatten, looseOnly, toPrefix } = rule;
  const baseDir = toPrefix && prefixPath ? prefixPath : gamePath;

  const matches: Array<{ relPath: string; sourcePath: string }> = [];

  for (const [relPath, sourcePath] of Object.entries(filemap)) {
    const basename = path.basename(relPath);
    const dir = path.dirname(relPath);
    const isRoot = dir === ".";

    let matched = false;

    // Check filename match (supports glob *)
    if (!matched && filenames) {
      for (const fn of filenames) {
        if (fn.includes("*")) {
          const re = new RegExp("^" + fn.replace(/\*/g, ".*") + "$", "i");
          if (re.test(basename)) { matched = true; break; }
        } else if (fn.toLowerCase() === basename.toLowerCase()) {
          matched = true; break;
        }
      }
      if (matched && looseOnly && !isRoot) matched = false;
    }

    // Check folder match
    if (!matched && folders) {
      const topFolder = relPath.split(/[/\\]/)[0];
      if (folders.some(f => f.toLowerCase() === topFolder.toLowerCase())) {
        matched = true;
      }
    }

    // Check extension match
    if (!matched && extensions) {
      const ext = path.extname(basename).toLowerCase();
      if (extensions.includes(ext)) {
        matched = true;
      }
    }

    if (matched) {
      matches.push({ relPath, sourcePath });
    }
  }

  for (const { relPath, sourcePath } of matches) {
    delete filemap[relPath];

    // Remove old link from deploy target directory
    const cleanupBase = cleanupDir || "Data";
    const oldTarget = path.join(gamePath, cleanupBase, relPath);
    try {
      if (fs.existsSync(oldTarget) && fs.lstatSync(oldTarget).isSymbolicLink()) {
        fs.unlinkSync(oldTarget);
      }
    } catch { /* */ }

    // Create link at correct target
    const destRelPath = flatten ? path.basename(relPath) : relPath;
    const targetPath = path.join(baseDir, dest, destRelPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    try {
      // Use symlink for custom-routed files (hardlink/copy less useful here)
      fs.symlinkSync(sourcePath, targetPath);
    } catch { /* */ }
    log?.(`  Routed ${relPath} → ${path.join(dest, destRelPath)}`);
  }
}

export function writePluginsForDeploy(
  gameId: string,
  prefixPath: string | undefined,
  _profile: string,
  filemap: Record<string, string>,
  log?: (msg: string) => void,
): void {
  if (!prefixPath) {
    log?.("  No prefix path — skipped plugins.txt");
    return;
  }
  const username = findPrefixUsername(prefixPath);
  const pluginsPath = pluginsTxtPath(prefixPath, gameId, username || "steamuser");
  const pluginNames = collectPlugins(filemap);

  const entries = pluginNames.map(name => ({ name, enabled: true }));
  fs.mkdirSync(path.dirname(pluginsPath), { recursive: true });
  fs.writeFileSync(pluginsPath, entries.map(e =>
    `${e.enabled ? "" : "*"}${e.name}`
  ).join("\n"), "utf-8");
  log?.(`  Wrote plugins.txt with ${entries.length} entries`);
}
