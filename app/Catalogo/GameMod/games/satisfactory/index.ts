import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { SATISFACTORY_CONSTANTS, SATISFACTORY_EXE_NAMES } from "./satisfactory.constants";
import { getCustomRoutingRules } from "./routing";

export function createSatisfactoryModule(): GameModule {
  const base = genericModule("satisfactory", "");
  return {
    ...base,
    id: "satisfactory",
    displayName: "Satisfactory",
    steamAppId: SATISFACTORY_CONSTANTS.steamAppId,
    altSteamAppIds: SATISFACTORY_CONSTANTS.altSteamAppIds,
    exeName: SATISFACTORY_CONSTANTS.exeName,
    preferredLaunchExe: SATISFACTORY_CONSTANTS.preferredLaunchExe,
    nexusDomain: SATISFACTORY_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => SATISFACTORY_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, SATISFACTORY_CONSTANTS.deployDir),
    getCustomRoutingRules: (prefixPath?: string) => getCustomRoutingRules(prefixPath),
    getFrameworks: () => ({
      "SML": "SML/Bootstrap.dll",
    }),
    getAutoInstallFrameworks: () => [
      {
        name: "SML (Satisfactory Mod Loader)",
        downloadUrl: "https://github.com/satisfactorymodding/SML/releases/download/3.7.1/SML-3.7.1.zip",
        detector: { folder: "SML" },
      },
    ],
  };
}
