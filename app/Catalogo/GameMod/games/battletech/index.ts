import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { BATTLETECH_CONSTANTS, BATTLETECH_EXE_NAMES } from "./battletech.constants";

export function createBattletechModule(): GameModule {
  const base = genericModule("battletech", "");
  return {
    ...base,
    id: "battletech",
    displayName: "BattleTech",
    steamAppId: BATTLETECH_CONSTANTS.steamAppId,
    altSteamAppIds: BATTLETECH_CONSTANTS.altSteamAppIds,
    exeName: BATTLETECH_CONSTANTS.exeName,
    preferredLaunchExe: BATTLETECH_CONSTANTS.preferredLaunchExe,
    nexusDomain: BATTLETECH_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => BATTLETECH_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, BATTLETECH_CONSTANTS.deployDir),
    getPluginExtensions: () => [".dll"],
  };
}
