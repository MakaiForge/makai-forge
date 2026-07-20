import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { DAO_CONSTANTS, DAO_EXE_NAMES } from "./dragonageorigins.constants";

export function createDragonageoriginsModule(): GameModule {
  const base = genericModule("dragonageorigins", "");
  return {
    ...base,
    id: "dragonageorigins",
    displayName: "Dragon Age: Origins",
    steamAppId: DAO_CONSTANTS.steamAppId,
    altSteamAppIds: DAO_CONSTANTS.altSteamAppIds,
    exeName: DAO_CONSTANTS.exeName,
    preferredLaunchExe: DAO_CONSTANTS.preferredLaunchExe,
    nexusDomain: DAO_CONSTANTS.nexusDomain,
    aliases: ["dao", "dragon age origins"],
    detect: (gp) => DAO_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, DAO_CONSTANTS.deployDir),
  };
}
