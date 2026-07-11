import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { CYBERPUNK_CONSTANTS, CYBERPUNK_EXE_NAMES, CYBERPUNK_DLL_OVERRIDES } from "./cyberpunk2077.constants";

export function createCyberpunk2077Module(): GameModule {
  const base = genericModule("cyberpunk2077", "");
  return {
    ...base,
    id: "cyberpunk2077",
    displayName: "Cyberpunk 2077",
    steamAppId: CYBERPUNK_CONSTANTS.steamAppId,
    altSteamAppIds: CYBERPUNK_CONSTANTS.altSteamAppIds,
    exeName: CYBERPUNK_CONSTANTS.exeName,
    preferredLaunchExe: CYBERPUNK_CONSTANTS.preferredLaunchExe,
    nexusDomain: CYBERPUNK_CONSTANTS.nexusDomain,
    aliases: ["cp2077", "cyberpunk"],
    detect: (gp) => CYBERPUNK_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getWineDllOverrides: () => ({ ...CYBERPUNK_DLL_OVERRIDES }),
    getWinetricksComponents: () => ["vcrun2022"],
    getFrameworks: () => ({
      "RED4ext": "red4ext/win64/red4ext.dll",
      "Cyber Engine Tweaks": "bin/x64/plugins/cyber_engine_tweaks.asi",
    }),
    getExternalTools: () => [
      { name: "WolvenKit", exeName: "WolvenKit.exe", searchPaths: ["."] },
      { name: "ArchiveXL", exeName: "", searchPaths: [] },
      { name: "TweakXL", exeName: "", searchPaths: [] },
      { name: "Codeware", exeName: "", searchPaths: [] },
    ],
  };
}
