import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { BG3_CONSTANTS, BG3_EXE_NAMES, BG3_DLL_OVERRIDES } from "./larian.constants";

export function createBaldursGate3Module(): GameModule {
  const base = genericModule("larian", "");
  return {
    ...base,
    id: "larian",
    displayName: "Baldur's Gate 3",
    steamAppId: BG3_CONSTANTS.steamAppId,
    altSteamAppIds: BG3_CONSTANTS.altSteamAppIds,
    exeName: BG3_CONSTANTS.exeName,
    preferredLaunchExe: BG3_CONSTANTS.preferredLaunchExe,
    nexusDomain: BG3_CONSTANTS.nexusDomain,
    aliases: ["bg3", "baldurs gate 3"],
    detect: (gp) => BG3_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, BG3_CONSTANTS.deployDir),
    getPluginExtensions: () => [...BG3_CONSTANTS.pluginExtensions],
    getWineDllOverrides: () => ({ ...BG3_DLL_OVERRIDES }),
    getWinetricksComponents: () => ["vcrun2022"],
    getFrameworks: () => ({
      "Script Extender": "bg3se_loader.exe",
    }),
    getExternalTools: () => [
      { name: "BG3 Mod Manager", exeName: "bg3mm.exe", searchPaths: ["."] },
    ],
  };
}
