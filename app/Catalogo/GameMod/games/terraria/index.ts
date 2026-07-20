import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { TERRARIA_CONSTANTS, TERRARIA_EXE_NAMES } from "./terraria.constants";

export function createTerrariaModule(): GameModule {
  const base = genericModule("terraria", "");
  return {
    ...base,
    id: "terraria",
    displayName: "Terraria",
    steamAppId: TERRARIA_CONSTANTS.steamAppId,
    altSteamAppIds: TERRARIA_CONSTANTS.altSteamAppIds,
    exeName: TERRARIA_CONSTANTS.exeName,
    preferredLaunchExe: TERRARIA_CONSTANTS.preferredLaunchExe,
    nexusDomain: TERRARIA_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => TERRARIA_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, TERRARIA_CONSTANTS.deployDir),
    getFrameworks: () => ({
      "tModLoader": "tModLoader.exe",
    }),
  };
}
