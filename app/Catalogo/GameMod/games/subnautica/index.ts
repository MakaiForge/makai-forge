import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { SUBNAUTICA_CONSTANTS, SUBNAUTICA_EXE_NAMES } from "./subnautica.constants";
import { getCustomRoutingRules } from "./routing";

export function createSubnauticaModule(): GameModule {
  const base = genericModule("subnautica", "");
  return {
    ...base,
    id: "subnautica",
    displayName: "Subnautica",
    steamAppId: SUBNAUTICA_CONSTANTS.steamAppId,
    altSteamAppIds: SUBNAUTICA_CONSTANTS.altSteamAppIds,
    exeName: SUBNAUTICA_CONSTANTS.exeName,
    preferredLaunchExe: SUBNAUTICA_CONSTANTS.preferredLaunchExe,
    nexusDomain: SUBNAUTICA_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => SUBNAUTICA_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, SUBNAUTICA_CONSTANTS.deployDir),
    getCustomRoutingRules: (prefixPath?: string) => getCustomRoutingRules(prefixPath),
    getFrameworks: () => ({
      "BepInEx": "BepInEx/core/BepInEx.Preloader.dll",
    }),
    getAutoInstallFrameworks: () => [
      {
        name: "BepInExPack Subnautica",
        downloadUrl: "https://subnautica.thunderstore.io/package/denikson/BepInExPack_Subnautica/5.4.1100/BepInExPack_Subnautica-5.4.1100.zip",
        detector: { folder: "BepInEx" },
        innerFolder: "BepInExPack_Subnautica",
      },
    ],
  };
}
