import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { DA2_CONSTANTS, DA2_EXE_NAMES } from "./dragonage2.constants";

export function createDragonage2Module(): GameModule {
  const base = genericModule("dragonage2", "");
  return {
    ...base,
    id: "dragonage2",
    displayName: "Dragon Age II",
    steamAppId: DA2_CONSTANTS.steamAppId,
    altSteamAppIds: DA2_CONSTANTS.altSteamAppIds,
    exeName: DA2_CONSTANTS.exeName,
    preferredLaunchExe: DA2_CONSTANTS.preferredLaunchExe,
    nexusDomain: DA2_CONSTANTS.nexusDomain,
    aliases: ["da2", "dragon age 2"],
    detect: (gp) => DA2_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, DA2_CONSTANTS.deployDir),
  };
}
