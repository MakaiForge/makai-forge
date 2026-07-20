import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { VALHEIM_CONSTANTS, VALHEIM_EXE_NAMES } from "./valheim.constants";
import { getCustomRoutingRules } from "./routing";

export function createValheimModule(): GameModule {
  const base = genericModule("valheim", "");
  return {
    ...base,
    id: "valheim",
    displayName: "Valheim",
    steamAppId: VALHEIM_CONSTANTS.steamAppId,
    altSteamAppIds: VALHEIM_CONSTANTS.altSteamAppIds,
    exeName: VALHEIM_CONSTANTS.exeName,
    preferredLaunchExe: VALHEIM_CONSTANTS.preferredLaunchExe,
    nexusDomain: VALHEIM_CONSTANTS.nexusDomain,
    aliases: [],
    detect: (gp) => VALHEIM_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, VALHEIM_CONSTANTS.deployDir),
    getCustomRoutingRules: (prefixPath?: string) => getCustomRoutingRules(prefixPath),
    getFrameworks: () => ({
      "BepInEx": "BepInEx/core/BepInEx.Preloader.dll",
    }),
    getAutoInstallFrameworks: () => [
      {
        name: "BepInExPack Valheim",
        downloadUrl: "https://valheim.thunderstore.io/package/denikson/BepInExPack_Valheim/5.4.1100/BepInExPack_Valheim-5.4.1100.zip",
        detector: { folder: "BepInEx" },
        innerFolder: "BepInExPack_Valheim",
        chmodFiles: ["start_game_bepinex.sh"],
      },
    ],
  };
}
