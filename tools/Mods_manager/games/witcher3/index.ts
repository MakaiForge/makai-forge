import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { WITCHER3_CONSTANTS, WITCHER3_EXE_NAMES, WITCHER3_DLL_OVERRIDES } from "./witcher3.constants";

export function createWitcher3Module(): GameModule {
  const base = genericModule("witcher3", "");
  return {
    ...base,
    id: "witcher3",
    displayName: "The Witcher 3: Wild Hunt",
    steamAppId: WITCHER3_CONSTANTS.steamAppId,
    altSteamAppIds: WITCHER3_CONSTANTS.altSteamAppIds,
    exeName: WITCHER3_CONSTANTS.exeName,
    preferredLaunchExe: WITCHER3_CONSTANTS.preferredLaunchExe,
    nexusDomain: WITCHER3_CONSTANTS.nexusDomain,
    aliases: ["tw3", "witcher3 wild hunt"],
    detect: (gp) => WITCHER3_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, WITCHER3_CONSTANTS.deployDir),
    getWineDllOverrides: () => ({ ...WITCHER3_DLL_OVERRIDES }),
    getWinetricksComponents: () => ["vcrun2019"],
    getPluginExtensions: () => WITCHER3_CONSTANTS.pluginExtensions,
    getExternalTools: () => [
      { name: "Script Merger", exeName: "ScriptMerger.exe", searchPaths: ["."] },
      { name: "Witcher 3 Mod Limit Fix", exeName: "", searchPaths: [] },
    ],
  };
}
