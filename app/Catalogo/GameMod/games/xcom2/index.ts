import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { XCOM2_CONSTANTS, XCOM2_EXE_NAMES } from "./xcom2.constants";

export function createXcom2Module(): GameModule {
  const base = genericModule("xcom2", "");
  return {
    ...base,
    id: "xcom2",
    displayName: "XCOM 2",
    steamAppId: XCOM2_CONSTANTS.steamAppId,
    altSteamAppIds: XCOM2_CONSTANTS.altSteamAppIds,
    exeName: XCOM2_CONSTANTS.exeName,
    preferredLaunchExe: XCOM2_CONSTANTS.preferredLaunchExe,
    nexusDomain: XCOM2_CONSTANTS.nexusDomain,
    aliases: ["xcom 2", "xcom2 wotc"],
    detect: (gp) => XCOM2_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, XCOM2_CONSTANTS.deployDir),
  };
}
