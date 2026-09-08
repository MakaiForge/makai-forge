import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { ZOMBOID_CONSTANTS, ZOMBOID_EXE_NAMES } from "./projectzomboid.constants";

export function createProjectzomboidModule(): GameModule {
  const base = genericModule("projectzomboid", "");
  return {
    ...base,
    id: "projectzomboid",
    displayName: "Project Zomboid",
    steamAppId: ZOMBOID_CONSTANTS.steamAppId,
    altSteamAppIds: ZOMBOID_CONSTANTS.altSteamAppIds,
    exeName: ZOMBOID_CONSTANTS.exeName,
    preferredLaunchExe: ZOMBOID_CONSTANTS.preferredLaunchExe,
    nexusDomain: ZOMBOID_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => ZOMBOID_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, ZOMBOID_CONSTANTS.deployDir),
  };
}
