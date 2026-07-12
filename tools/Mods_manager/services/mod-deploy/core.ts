import path from "node:path";
import fs from "node:fs";
import type { ModlistEntry, DeploymentResult, ModInventory } from "@types";
import { ModConflictService } from "../mod-conflict-service";
import { ModStorageService } from "../mod-storage-service";
import { expandHome } from "../path-utils";
import { getDeployTarget, shouldWritePluginsTxt } from "./rules";
import { getStagingDir, findPrefixUsername, buildPluginFilemap, stripDataPrefix } from "../../games/_shared/filemap";

function getGameLocalDir(gameId: string): string {
  const map: Record<string, string> = {
    skyrim_se: "Skyrim Special Edition",
    skyrim: "Skyrim",
    fallout4: "Fallout 4",
    fallout3: "Fallout 3",
    falloutnv: "Fallout New Vegas",
    cyberpunk_2077: "Cyberpunk 2077",
    baldurs_gate_3: "Baldur's Gate 3",
    starfield: "Starfield",
    oblivion: "Oblivion",
    enderal: "Enderal",
  };
  return map[gameId] || gameId;
}

async function forceCopyScriptExtenders(
  gameId: string,
  modlist: ModlistEntry[],
  stagingDir: string,
  gamePath: string,
  log: string[]
): Promise<number> {
  let seCopied = 0;
  for (const mod of modlist.filter((m: any) => m.enabled && !m.isSeparator)) {
    const invKey = `game:${gameId}:mod:${mod.name}:inventory`;
    const inventory: ModInventory | undefined = ModStorageService.get(invKey);
    if (!inventory?.scriptExtenderFiles?.length) continue;
    for (const seFile of inventory.scriptExtenderFiles) {
      const modStaging = stagingDir || getStagingDir(gameId);
      const strippedPath = stripDataPrefix(seFile.relativePath);
      const sourcePath = path.join(modStaging, mod.name, seFile.relativePath);
      const targetPath = path.join(gamePath, strippedPath);
      if (!fs.existsSync(sourcePath)) continue;
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        fs.copyFileSync(sourcePath, targetPath);
        seCopied++;
      } catch (err) {
        log.push(`Failed to force-copy SE ${seFile.relativePath}: ${String(err)}`);
      }
    }
  }
  return seCopied;
}

function scanExistingSymlinks(dataDir: string): Record<string, string> {
  const symlinks: Record<string, string> = {};
  const walk = (dir: string, relativePrefix: string = "") => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isSymbolicLink()) {
        symlinks[relPath] = fs.readlinkSync(fullPath);
      }
    }
  };
  if (fs.existsSync(dataDir)) {
    walk(dataDir);
  }
  return symlinks;
}

function createSymlinks(
  dataDir: string,
  filemap: Record<string, string>,
  log: string[]
): number {
  let symlinksCreated = 0;
  for (const [relativePath, sourcePath] of Object.entries(filemap)) {
    const targetPath = path.join(dataDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      fs.symlinkSync(sourcePath, targetPath);
      symlinksCreated++;
    } catch (err) {
      log.push(`Failed to link ${relativePath}: ${String(err)}`);
    }
  }
  return symlinksCreated;
}

function rollbackDeploy(
  dataDir: string,
  filemap: Record<string, string>,
  preExistingSymlinks: Record<string, string>,
  log: string[]
): void {
  log.push(`Deploy failed. Rolling back...`);
  for (const relativePath of Object.keys(filemap)) {
    const targetPath = path.join(dataDir, relativePath);
    try {
      if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isSymbolicLink()) {
        fs.unlinkSync(targetPath);
      }
    } catch { /* skip */ }
  }
  for (const [relPath, linkTarget] of Object.entries(preExistingSymlinks)) {
    const targetPath = path.join(dataDir, relPath);
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.symlinkSync(linkTarget, targetPath);
    } catch { /* skip */ }
  }
  log.push(`Rollback complete: ${Object.keys(preExistingSymlinks).length} symlinks restored`);
}

async function writePluginsTxt(
  gameId: string,
  profile: string,
  filemap: Record<string, string>,
  config: any,
  log: string[]
): Promise<void> {
  const prefixPath = config.protonPrefix ? expandHome(config.protonPrefix) : "";
  const username = prefixPath ? findPrefixUsername(prefixPath) : null;
  const pluginsTxtPath = username
    ? path.join(prefixPath, "drive_c", "users", username, "AppData", "Local", getGameLocalDir(gameId), "plugins.txt")
    : path.join(prefixPath, "drive_c", "users", "steamuser", "AppData", "Local", getGameLocalDir(gameId), "plugins.txt");

  const pluginExts = new Set([".esp", ".esm", ".esl"]);
  const pluginNames: string[] = [];
  const pluginPaths: Record<string, string> = {};
  for (const [relPath, sourcePath] of Object.entries(filemap)) {
    const ext = path.extname(relPath).toLowerCase();
    if (pluginExts.has(ext)) {
      const name = path.basename(relPath);
      pluginNames.push(name);
      pluginPaths[name] = sourcePath;
    }
  }

  let sortedPlugins: string[] = pluginNames;
  try {
    const { PluginSortService } = await import("../plugin-sort-service");
    sortedPlugins = PluginSortService.sort(pluginNames, pluginPaths);
    log.push(`Plugins sorted: ${sortedPlugins.join(", ")}`);
  } catch (err) {
    log.push(`Plugin sort failed (falling back to unsorted): ${String(err)}`);
  }

  const pluginsKey = `game:${gameId}:profile:${profile}:plugins`;
  const savedPlugins: any[] = ModStorageService.get(pluginsKey) || [];
  const savedMap = new Map(savedPlugins.map(p => [p.name.toLowerCase(), p]));

  const pluginEntries = sortedPlugins.map((name: string) => {
    const saved = savedMap.get(name.toLowerCase());
    return { name, enabled: saved ? saved.enabled : true };
  });

  const { ModManagerService } = await import("../mod-manager-service");
  fs.mkdirSync(path.dirname(pluginsTxtPath), { recursive: true });
  if (ModManagerService.writePlugins(pluginsTxtPath, pluginEntries)) {
    log.push(`Wrote plugins.txt with ${pluginEntries.length} entries (${pluginEntries.filter(e => e.enabled).length} enabled)`);
    ModStorageService.put(pluginsKey, pluginEntries);
  } else {
    log.push(`Failed to write plugins.txt`);
  }
}

export async function buildFilemap(
  modlist: ModlistEntry[],
  stagingDir: string,
  gamePath: string
): Promise<Record<string, string>> {
  return buildPluginFilemap(modlist, stagingDir, gamePath);
}

export async function undeployMod(
  gameId: string,
  modName: string,
  gamePath: string
): Promise<void> {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const stagingDir = config?.stagingDir ? expandHome(config.stagingDir) : getStagingDir(gameId);
  const modStaging = path.join(stagingDir, modName);
  if (!fs.existsSync(modStaging)) return;

  const dataDir = getDeployTarget(gameId, gamePath);
  if (!fs.existsSync(dataDir)) return;

  const removeSymlinks = (dir: string, relativePrefix: string = "") => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rawRelativePath = path.join(relativePrefix, entry.name);
      if (entry.isDirectory()) {
        removeSymlinks(fullPath, rawRelativePath);
      } else if (entry.isFile()) {
        const relativePath = stripDataPrefix(rawRelativePath);
        const targetPath = path.join(dataDir, relativePath);
        try {
          if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isSymbolicLink()) {
            const linkTarget = fs.readlinkSync(targetPath);
            if (linkTarget === fullPath) {
              fs.unlinkSync(targetPath);
            }
          }
        } catch { /* skip */ }
      }
    }
  };

  removeSymlinks(modStaging);
}

export async function deploy(
  gameId: string,
  profile: string
): Promise<DeploymentResult> {
  const log: string[] = [];
  log.push(`Starting deploy for ${gameId}/${profile}`);

  const config = ModStorageService.get<any>(`game:${gameId}:config`);

  if (!config) {
    return { success: false, log: [...log, "Game not configured"], filemap: {} };
  }

  const stagingDir = config.stagingDir ? expandHome(config.stagingDir) : getStagingDir(gameId);
  const gamePath = config.gamePath ? expandHome(config.gamePath) : "";

  if (!gamePath || !fs.existsSync(gamePath)) {
    return { success: false, log: [...log, "Game path not found"], filemap: {} };
  }

  const modlistKey = `game:${gameId}:profile:${profile}:modlist`;
  const modlist: ModlistEntry[] =
    ModStorageService.get(modlistKey) || [];

  log.push(`${modlist.filter((m: any) => m.enabled).length} mods enabled`);

  const enabledMods = modlist
    .filter((m: any) => m.enabled && !m.isSeparator)
    .map((m: any, i: number) => ({ name: m.name, priority: m.priority ?? i }));

  const conflicts = await ModConflictService.detectConflicts(gameId, enabledMods);
  const criticalConflicts = conflicts.filter(c => c.type === "plugin");
  if (criticalConflicts.length > 0) {
    log.push(`WARNING: ${criticalConflicts.length} plugin conflict(s) detected:`);
    for (const c of criticalConflicts) {
      log.push(`  ${c.relativePath} — ${c.mods.map(m => m.name).join(" vs ")}`);
    }
    log.push(`  Winner: ${criticalConflicts[0].winner} (priority wins)`);
  }
  if (conflicts.length > 0) {
    log.push(`Total conflicts: ${conflicts.length} (${criticalConflicts.length} critical)`);
  }

  const filemap = await buildFilemap(modlist, stagingDir, gamePath);
  log.push(`Built filemap with ${Object.keys(filemap).length} entries`);

  const seCopied = await forceCopyScriptExtenders(gameId, modlist, stagingDir, gamePath, log);
  if (seCopied > 0) log.push(`Force-copied ${seCopied} script extender files to game root`);

  const dataDir = getDeployTarget(gameId, gamePath);
  if (!fs.existsSync(dataDir)) {
    return { success: false, log: [...log, "Data directory not found"], filemap: {} };
  }

  log.push(`Target: ${dataDir}`);

  const preExistingSymlinks = scanExistingSymlinks(dataDir);
  log.push(`Saved manifest: ${Object.keys(preExistingSymlinks).length} pre-existing symlinks`);

  try {
    fs.mkdirSync(dataDir, { recursive: true });

    const symlinksCreated = createSymlinks(dataDir, filemap, log);

    if (shouldWritePluginsTxt(gameId)) {
      await writePluginsTxt(gameId, profile, filemap, config, log);
    } else {
      log.push(`Skipped plugins.txt (non-Bethesda game: ${gameId})`);
    }

    log.push(`Deploy complete: ${symlinksCreated} symlinks created`);
    return { success: true, log, filemap };
  } catch (err) {
    rollbackDeploy(dataDir, filemap, preExistingSymlinks, log);
    return { success: false, log, filemap: {} };
  }
}

export async function restore(gameId: string, gamePath: string): Promise<void> {
  const dataDir = getDeployTarget(gameId, gamePath);
  if (!fs.existsSync(dataDir)) return;

  const removeAllSymlinks = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        removeAllSymlinks(fullPath);
        try {
          const remaining = fs.readdirSync(fullPath);
          if (remaining.length === 0) fs.rmdirSync(fullPath);
        } catch { /* skip */ }
      } else if (entry.isSymbolicLink()) {
        try {
          fs.unlinkSync(fullPath);
        } catch { /* skip */ }
      }
    }
  };

  removeAllSymlinks(dataDir);
}
