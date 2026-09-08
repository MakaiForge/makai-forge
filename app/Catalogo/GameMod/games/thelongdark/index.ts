import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { LONG_DARK_CONSTANTS, LONG_DARK_EXE_NAMES } from "./thelongdark.constants";

export function createThelongdarkModule(): GameModule {
  const base = genericModule("thelongdark", "");
  return {
    ...base,
    id: "thelongdark",
    displayName: "The Long Dark",
    steamAppId: LONG_DARK_CONSTANTS.steamAppId,
    altSteamAppIds: LONG_DARK_CONSTANTS.altSteamAppIds,
    exeName: LONG_DARK_CONSTANTS.exeName,
    preferredLaunchExe: LONG_DARK_CONSTANTS.preferredLaunchExe,
    nexusDomain: LONG_DARK_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => LONG_DARK_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, LONG_DARK_CONSTANTS.deployDir),
  };
}
