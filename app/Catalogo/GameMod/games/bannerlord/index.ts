import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { BANNERLORD_CONSTANTS, BANNERLORD_EXE_NAMES } from "./bannerlord.constants";

export function createBannerlordModule(): GameModule {
  const base = genericModule("bannerlord", "");
  return {
    ...base,
    id: "bannerlord",
    displayName: "Mount & Blade II: Bannerlord",
    steamAppId: BANNERLORD_CONSTANTS.steamAppId,
    altSteamAppIds: BANNERLORD_CONSTANTS.altSteamAppIds,
    exeName: BANNERLORD_CONSTANTS.exeName,
    preferredLaunchExe: BANNERLORD_CONSTANTS.preferredLaunchExe,
    nexusDomain: BANNERLORD_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => BANNERLORD_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, BANNERLORD_CONSTANTS.deployDir),
    getPluginExtensions: () => [".dll"],
  };
}
