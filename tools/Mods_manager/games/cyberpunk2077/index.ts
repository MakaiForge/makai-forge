import fs from "node:fs";
import path from "node:path";
import type { GameModule } from "../_shared/types";
import { genericModule } from "../generic";
import { CYBERPUNK_CONSTANTS, CYBERPUNK_EXE_NAMES, CYBERPUNK_DLL_OVERRIDES } from "./cyberpunk2077.constants";
import { getCustomRoutingRules } from "./routing";

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
    filemapCasing: "lower",
    getWineDllOverrides: () => ({ ...CYBERPUNK_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["d3dcompiler_47"],
    getCustomRoutingRules: (prefixPath?: string) => getCustomRoutingRules(prefixPath),
    getFrameworks: () => ({
      "RED4ext": "red4ext/win64/red4ext.dll",
      "Cyber Engine Tweaks": "bin/x64/plugins/cyber_engine_tweaks.asi",
    }),
    getAutoInstallFrameworks: () => [
      {
        name: "RED4ext",
        downloadUrl: "https://github.com/wghost/RED4ext/releases/download/v0.5.4/RED4ext.zip",
        detector: { folder: "red4ext" },
      },
      {
        name: "Cyber Engine Tweaks (CET)",
        downloadUrl: "https://github.com/cesm2020/CET/releases/download/1.32.0/CET.zip",
        detector: { file: "bin/x64/plugins/cyber_engine_tweaks.asi" },
      },
    ],
    getExternalTools: () => [
      { name: "WolvenKit", exeName: "WolvenKit.exe", searchPaths: ["."], downloadUrl: "https://github.com/WolvenKit/WolvenKit/releases/download/8.19.0/WolvenKit-8.19.0.zip", detector: { file: "WolvenKit.exe" }, useProton: true },
      { name: "ArchiveXL", exeName: "", searchPaths: [] },
      { name: "TweakXL", exeName: "", searchPaths: [] },
      { name: "Codeware", exeName: "", searchPaths: [] },
    ],
  };
}
