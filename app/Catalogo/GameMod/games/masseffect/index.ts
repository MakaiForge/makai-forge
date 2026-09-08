import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { ME_CONSTANTS, ME_EXE_NAMES } from "./masseffect.constants";

export function createMasseffectModule(): GameModule {
  const base = genericModule("masseffect", "");
  return {
    ...base,
    id: "masseffect",
    displayName: "Mass Effect (Legendary)",
    steamAppId: ME_CONSTANTS.steamAppId,
    altSteamAppIds: ME_CONSTANTS.altSteamAppIds,
    exeName: ME_CONSTANTS.exeName,
    preferredLaunchExe: ME_CONSTANTS.preferredLaunchExe,
    nexusDomain: ME_CONSTANTS.nexusDomain,
    aliases: ["mass effect legendary", "mass effect"],
    detect: (gp) => ME_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, ME_CONSTANTS.deployDir),
  };
}
