import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { SEVEN_DAYS_CONSTANTS, SEVEN_DAYS_EXE_NAMES } from "./7daystodie.constants";

export function create7daystodieModule(): GameModule {
  const base = genericModule("7daystodie", "");
  return {
    ...base,
    id: "7daystodie",
    displayName: "7 Days to Die",
    steamAppId: SEVEN_DAYS_CONSTANTS.steamAppId,
    altSteamAppIds: SEVEN_DAYS_CONSTANTS.altSteamAppIds,
    exeName: SEVEN_DAYS_CONSTANTS.exeName,
    preferredLaunchExe: SEVEN_DAYS_CONSTANTS.preferredLaunchExe,
    nexusDomain: SEVEN_DAYS_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => SEVEN_DAYS_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, SEVEN_DAYS_CONSTANTS.deployDir),
  };
}
