import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { KSP_CONSTANTS, KSP_EXE_NAMES } from "./kerbalspaceprogram.constants";

export function createKerbalspaceprogramModule(): GameModule {
  const base = genericModule("kerbalspaceprogram", "");
  return {
    ...base,
    id: "kerbalspaceprogram",
    displayName: "Kerbal Space Program",
    steamAppId: KSP_CONSTANTS.steamAppId,
    altSteamAppIds: KSP_CONSTANTS.altSteamAppIds,
    exeName: KSP_CONSTANTS.exeName,
    preferredLaunchExe: KSP_CONSTANTS.preferredLaunchExe,
    nexusDomain: KSP_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => KSP_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, KSP_CONSTANTS.deployDir),
  };
}
