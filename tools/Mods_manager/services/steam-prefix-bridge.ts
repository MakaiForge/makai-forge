import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";
import { findAllSteamLibraries } from "@prefix/core/steam-paths";
import { setSteamGameProton, setSteamGameLaunchOptions } from "@main/services/steam-config-vdf";

/**
 * Bridge between our custom prefix and Steam's compatdata system.
 *
 * When the user configures a custom prefix (e.g. ~/Games/Prefix/skyrim/),
 * Steam doesn't know about it. This service:
 * 1. Creates a symlink from compatdata/{appId}/pfx → our custom prefix
 * 2. Updates config.vdf CompatToolMapping with the selected Proton
 *
 * This way both Steam AND our app share the same prefix.
 */
export interface BridgeResult {
  success: boolean;
  symlinkCreated: boolean;
  configUpdated: boolean;
  error?: string;
}

export async function bridgePrefixToSteam(
  _gameId: string,
  customPrefixPath: string,
  steamAppId: string,
  protonName?: string,
): Promise<BridgeResult> {
  const result: BridgeResult = { success: false, symlinkCreated: false, configUpdated: false };

  try {
    // Find the Steam compatdata directory for this game
    const libraries = findAllSteamLibraries();
    let compatDataDir: string | null = null;
    let libraryPath: string | null = null;

    for (const lib of libraries) {
      const candidate = path.join(lib, "compatdata", steamAppId);
      if (fs.existsSync(path.dirname(candidate))) {
        compatDataDir = candidate;
        libraryPath = lib;
        break;
      }
    }

    if (!compatDataDir || !libraryPath) {
      // Create compatdata dir in the first Steam library
      if (libraries.length > 0) {
        libraryPath = libraries[0];
        compatDataDir = path.join(libraryPath, "compatdata", steamAppId);
        fs.mkdirSync(compatDataDir, { recursive: true });
        logger.info(`[SteamPrefixBridge] Created compatdata dir: ${compatDataDir}`);
      } else {
        result.error = "No Steam library found";
        return result;
      }
    }

    const pfxPath = path.join(compatDataDir, "pfx");
    const resolvedCustom = path.resolve(customPrefixPath);

    // Safety: prevent circular symlink (pfx pointing to itself)
    if (path.resolve(pfxPath) === resolvedCustom) {
      result.error = `pfx path equals custom prefix — circular symlink prevented: ${pfxPath}`;
      return result;
    }

    // Step 1: Create symlink if needed
    if (fs.existsSync(pfxPath)) {
      // Check if it's already a symlink to our prefix
      const stat = fs.lstatSync(pfxPath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(pfxPath);
        if (path.resolve(target) === resolvedCustom) {
          logger.info(`[SteamPrefixBridge] Symlink already correct: ${pfxPath} → ${resolvedCustom}`);
          result.symlinkCreated = true;
        } else {
          // Re-point the symlink
          fs.unlinkSync(pfxPath);
          fs.symlinkSync(resolvedCustom, pfxPath, "dir");
          logger.info(`[SteamPrefixBridge] Re-pointed symlink: ${pfxPath} → ${resolvedCustom}`);
          result.symlinkCreated = true;
        }
      } else {
        // pfx exists as a real directory — rename it as backup and create symlink
        const backupPath = pfxPath + ".bak." + Date.now();
        try {
          fs.renameSync(pfxPath, backupPath);
          fs.symlinkSync(resolvedCustom, pfxPath, "dir");
          logger.info(`[SteamPrefixBridge] Backed up real pfx to ${backupPath}, created symlink`);
          result.symlinkCreated = true;
        } catch (err) {
          logger.error(`[SteamPrefixBridge] Failed to replace real pfx dir: ${err}`);
          result.error = `Cannot replace existing pfx directory: ${err}`;
          return result;
        }
      }
    } else {
      // pfx doesn't exist — create symlink
      fs.symlinkSync(resolvedCustom, pfxPath, "dir");
      logger.info(`[SteamPrefixBridge] Created symlink: ${pfxPath} → ${resolvedCustom}`);
      result.symlinkCreated = true;
    }

    // Step 2: Update config.vdf with Proton selection
    if (protonName) {
      const updated = await setSteamGameProton(steamAppId, protonName);
      result.configUpdated = updated;
      if (updated) {
        logger.info(`[SteamPrefixBridge] Updated config.vdf: ${steamAppId} → ${protonName}`);
      } else {
        logger.warn(`[SteamPrefixBridge] Failed to update config.vdf for ${steamAppId}`);
      }
    } else {
      result.configUpdated = true; // No proton to set
    }

    // Step 3: Inject LaunchOptions so Steam uses our custom prefix via STEAM_COMPAT_DATA_PATH
    const launchOpt = `STEAM_COMPAT_DATA_PATH=${resolvedCustom} %command%`;
    const launchOk = await setSteamGameLaunchOptions(steamAppId, launchOpt);
    if (launchOk) {
      logger.info(`[SteamPrefixBridge] Set LaunchOptions: ${launchOpt}`);
    } else {
      logger.warn(`[SteamPrefixBridge] Failed to set LaunchOptions for ${steamAppId}`);
    }

    result.success = true;
    return result;
  } catch (err) {
    logger.error(`[SteamPrefixBridge] Error: ${err}`);
    result.error = String(err);
    return result;
  }
}

/**
 * Check if the Steam compatdata symlink is already pointing to our prefix.
 */
export function isBridged(steamAppId: string, customPrefixPath: string): boolean {
  const libraries = findAllSteamLibraries();
  const resolvedCustom = path.resolve(customPrefixPath);

  for (const lib of libraries) {
    const pfxPath = path.join(lib, "compatdata", steamAppId, "pfx");
    if (fs.existsSync(pfxPath)) {
      const stat = fs.lstatSync(pfxPath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(pfxPath);
        if (path.resolve(target) === resolvedCustom) return true;
      }
    }
  }
  return false;
}
