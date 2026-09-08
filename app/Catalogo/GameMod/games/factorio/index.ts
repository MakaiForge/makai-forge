import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { FACTORIO_CONSTANTS, FACTORIO_EXE_NAMES } from "./factorio.constants";

export function createFactorioModule(): GameModule {
  const base = genericModule("factorio", "");
  return {
    ...base,
    id: "factorio",
    displayName: "Factorio",
    steamAppId: FACTORIO_CONSTANTS.steamAppId,
    altSteamAppIds: FACTORIO_CONSTANTS.altSteamAppIds,
    exeName: FACTORIO_CONSTANTS.exeName,
    preferredLaunchExe: FACTORIO_CONSTANTS.preferredLaunchExe,
    nexusDomain: FACTORIO_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => FACTORIO_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, FACTORIO_CONSTANTS.deployDir),
    getPluginExtensions: () => [".zip"],
  };
}
