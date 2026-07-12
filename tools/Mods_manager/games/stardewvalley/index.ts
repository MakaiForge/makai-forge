import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { genericModule } from "../generic";
import { STARDEW_CONSTANTS, STARDEW_EXE_NAMES } from "./stardewvalley.constants";
import { getCustomRoutingRules } from "./routing";
import { buildFilemap } from "../_shared/filemap";
import { scanSymlinks, linkAll, restoreSymlinks } from "../_shared/symlink";

/**
 * Stardew Valley deploy: preserves mod folder structure.
 * Each mod stays in its own subfolder under Mods/.
 */
async function deployStardewValley(
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  _profile: string,
  _prefixPath?: string,
  mode?: LinkMode,
): Promise<DeploymentResult> {
  const log: string[] = [];
  const effectiveMode: LinkMode = mode || "symlink";
  const modsDir = path.join(gamePath, STARDEW_CONSTANTS.deployDir);

  // Build filemap preserving mod folder structure
  const filemap = await buildFilemap(modlist, stagingDir, gamePath, { preserveModFolder: true });
  log.push(`Built filemap with ${Object.keys(filemap).length} entries (mod folder preserved)`);

  const preExisting = fs.existsSync(modsDir) ? scanSymlinks(modsDir) : {};

  try {
    fs.mkdirSync(modsDir, { recursive: true });
    const count = linkAll(filemap, modsDir, effectiveMode);
    log.push(`Created ${count} links in Mods/`);
    return { success: true, log, filemap };
  } catch (err) {
    log.push(`Deploy failed: ${String(err)}. Rolling back...`);
    for (const relPath of Object.keys(filemap)) {
      const target = path.join(modsDir, relPath);
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* */ }
    }
    restoreSymlinks(preExisting, modsDir);
    return { success: false, log, filemap: {} };
  }
}

export function createStardewvalleyModule(): GameModule {
  const base = genericModule("stardewvalley", "");
  return {
    ...base,
    id: "stardewvalley",
    displayName: "Stardew Valley",
    steamAppId: STARDEW_CONSTANTS.steamAppId,
    altSteamAppIds: STARDEW_CONSTANTS.altSteamAppIds,
    exeName: STARDEW_CONSTANTS.exeName,
    preferredLaunchExe: STARDEW_CONSTANTS.preferredLaunchExe,
    nexusDomain: STARDEW_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => STARDEW_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    filemapCasing: "lower",
    getDeployTarget: (gp) => path.join(gp, STARDEW_CONSTANTS.deployDir),
    getCustomRoutingRules: (prefixPath?: string) => getCustomRoutingRules(prefixPath),
    deploy: deployStardewValley,
    getFrameworks: () => ({
      "SMAPI": "StardewModdingAPI.exe",
    }),
    getAutoInstallFrameworks: () => [
      {
        name: "SMAPI",
        downloadUrl: "https://github.com/Pathoschild/SMAPI/releases/download/4.1.10/SMAPI-4.1.10.zip",
        detector: { file: "StardewModdingAPI.exe" },
      },
    ],
  };
}
