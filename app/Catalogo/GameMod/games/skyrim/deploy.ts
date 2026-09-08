import fs from "node:fs";
import path from "node:path";
import type { DeploymentResult, ModlistEntry } from "@types";
import type { LinkMode } from "../_shared/types";
import { deployFilemap, restoreCore, symlinkPluginsTxt, removePluginsTxtSymlink, symlinkIniFiles, removeIniSymlinks } from "../_shared/bethesda-deploy-helpers";
import { applyInvalidation, revertInvalidation, deployedModBsas } from "../_shared/bethesda-invalidation";
import { collectPlugins } from "../_shared/bethesda-plugins";
import { SKYRIM_CONSTANTS } from "./skyrim.constants";
import { getInvalidationConfig } from "./invalidation";
import { getCustomRoutingRules } from "./routing";
import { findPrefixUsername } from "../_shared/filemap";

export interface SkyrimConstants {
  exeName: string
  launcherName: string
  skseLoaderName: string
  myGamesSubpath: string
  appDataSubpath: string
  skipLauncherSwap?: boolean
}

function bethesdaPluginsTxtPath(prefixPath: string, username: string, appDataSubpath: string): string {
  return path.join(prefixPath, "drive_c/users", username, "AppData/Local", appDataSubpath, "plugins.txt");
}

function listBsaFiles(dataDir: string): string[] {
  if (!fs.existsSync(dataDir)) return [];
  try {
    return fs.readdirSync(dataDir).filter(f => {
      const l = f.toLowerCase();
      return l.endsWith(".bsa") || l.endsWith(".ba2");
    });
  } catch { return []; }
}

export function swapLauncher(
  gamePath: string,
  exeName: string,
  skseLoaderName: string,
  enableSkse: boolean,
  log?: (msg: string) => void,
): void {
  const skse = path.join(gamePath, skseLoaderName);
  const launcher = path.join(gamePath, exeName);
  const backup = path.join(gamePath, `${exeName}.bak`);

  if (enableSkse) {
    if (!fs.existsSync(skse)) {
      log?.(`  ${skseLoaderName} not found — skipping launcher swap`);
      return;
    }
    if (fs.existsSync(launcher)) {
      try { fs.renameSync(launcher, backup); log?.(`  Renamed ${exeName} → ${exeName}.bak`); }
      catch { /* */ }
    }
    try { fs.copyFileSync(skse, launcher); log?.(`  Copied ${skseLoaderName} → ${exeName}`); }
    catch { /* */ }
  } else {
    if (!fs.existsSync(backup)) return;
    if (fs.existsSync(launcher)) { try { fs.unlinkSync(launcher); } catch { /* */ } }
    try { fs.renameSync(backup, launcher); log?.(`  Restored ${exeName} from ${exeName}.bak`); }
    catch { /* */ }
  }
}

export async function deploySkyrimVariant(
  _gameId: string,
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  profile: string,
  prefixPath: string | undefined,
  mode: LinkMode | undefined,
  sc: SkyrimConstants,
): Promise<DeploymentResult> {
  const log: string[] = [];
  const dataDir = path.join(gamePath, "Data");

  if (!sc.skipLauncherSwap) {
    swapLauncher(gamePath, sc.launcherName, sc.skseLoaderName, true, (m) => log.push(m));
  }

  log.push("Deploying mods to Data/...");
  const result = await deployFilemap(
    dataDir, stagingDir, modlist, gamePath,
    getCustomRoutingRules(prefixPath),
    mode, prefixPath, (m) => log.push(m),
  );

  if (!result.success) {
    swapLauncher(gamePath, sc.launcherName, sc.skseLoaderName, false);
    return result;
  }

  const profileDir = path.join(stagingDir, "..", "profiles", profile);
  const pluginsTxt = path.join(profileDir, "plugins.txt");

  // Write plugins.txt from deployed ESPs
  fs.mkdirSync(profileDir, { recursive: true });
  const pluginNames = collectPlugins(result.filemap);
  if (pluginNames.length > 0) {
    fs.writeFileSync(pluginsTxt, pluginNames.join("\n"), "utf-8");
    log.push(`  Wrote plugins.txt with ${pluginNames.length} entries`);
  }

  if (prefixPath && fs.existsSync(pluginsTxt)) {
    const username = findPrefixUsername(prefixPath);
    const p = bethesdaPluginsTxtPath(prefixPath, username || "steamuser", sc.appDataSubpath);
    symlinkPluginsTxt(p, pluginsTxt, (m) => log.push(m));
  }

  if (prefixPath) {
    const username = findPrefixUsername(prefixPath) || "steamuser";
    const myGames = path.join(prefixPath, "drive_c/users", username, "Documents/My Games", sc.myGamesSubpath);
    if (fs.existsSync(path.dirname(myGames))) {
      const iniDir = path.join(profileDir, "ini files");
      symlinkIniFiles(iniDir, myGames, (m) => log.push(m));
    }
  }

  const config = getInvalidationConfig();
  const modBsaNames = prefixPath ? listBsaFiles(dataDir) : undefined;
  applyInvalidation(config, gamePath, prefixPath, sc.myGamesSubpath, modBsaNames);

  log.push("Deploy complete");
  return { success: true, log, filemap: result.filemap };
}

export async function restoreSkyrimVariant(
  _gameId: string,
  gamePath: string,
  stagingDir: string,
  profile: string,
  prefixPath: string | undefined,
  sc: SkyrimConstants,
): Promise<void> {
  const log: string[] = [];
  const dataDir = path.join(gamePath, "Data");

  if (prefixPath) {
    const username = findPrefixUsername(prefixPath);
    const p = bethesdaPluginsTxtPath(prefixPath, username || "steamuser", sc.appDataSubpath);
    removePluginsTxtSymlink(p, (m) => log.push(m));

    const resUsername = findPrefixUsername(prefixPath) || "steamuser";
    const myGames = path.join(prefixPath, "drive_c/users", resUsername, "Documents/My Games", sc.myGamesSubpath);
    if (fs.existsSync(path.dirname(myGames))) {
      const profileDir = path.join(stagingDir, "..", "profiles", profile);
      const iniDir = path.join(profileDir, "ini files");
      removeIniSymlinks(iniDir, myGames, (m) => log.push(m));
    }
  }

  const config = getInvalidationConfig();
  const modBsaNames = deployedModBsas(dataDir);
  revertInvalidation(config, gamePath, prefixPath, sc.myGamesSubpath, modBsaNames);

  restoreCore(dataDir, undefined, (m) => log.push(m));
  if (!sc.skipLauncherSwap) {
    swapLauncher(gamePath, sc.launcherName, sc.skseLoaderName, false, (m) => log.push(m));
  }
}

export const SKYRIM_SKYRIM_CONSTANTS: SkyrimConstants = {
  exeName: SKYRIM_CONSTANTS.exeName,
  launcherName: SKYRIM_CONSTANTS.launcherName,
  skseLoaderName: SKYRIM_CONSTANTS.scriptExtenderName,
  myGamesSubpath: SKYRIM_CONSTANTS.myGamesSubpath,
  appDataSubpath: SKYRIM_CONSTANTS.appDataSubpath,
};

export async function deploySkyrim(
  gameId: string, gamePath: string, stagingDir: string,
  modlist: ModlistEntry[], profile: string,
  prefixPath?: string, mode?: LinkMode,
): Promise<DeploymentResult> {
  return deploySkyrimVariant(gameId, gamePath, stagingDir, modlist, profile, prefixPath, mode, SKYRIM_SKYRIM_CONSTANTS);
}

export async function restoreSkyrim(
  gameId: string, gamePath: string, stagingDir: string,
  profile: string, prefixPath?: string,
): Promise<void> {
  return restoreSkyrimVariant(gameId, gamePath, stagingDir, profile, prefixPath, SKYRIM_SKYRIM_CONSTANTS);
}
