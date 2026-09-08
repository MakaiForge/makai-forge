import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { RIMWORLD_CONSTANTS, RIMWORLD_EXE_NAMES } from "./rimworld.constants";

export function createRimworldModule(): GameModule {
  const base = genericModule("rimworld", "");
  return {
    ...base,
    id: "rimworld",
    displayName: "RimWorld",
    steamAppId: RIMWORLD_CONSTANTS.steamAppId,
    altSteamAppIds: RIMWORLD_CONSTANTS.altSteamAppIds,
    exeName: RIMWORLD_CONSTANTS.exeName,
    preferredLaunchExe: RIMWORLD_CONSTANTS.preferredLaunchExe,
    nexusDomain: RIMWORLD_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => RIMWORLD_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, RIMWORLD_CONSTANTS.deployDir),
    getPluginExtensions: () => [".dll"],
  };
}
