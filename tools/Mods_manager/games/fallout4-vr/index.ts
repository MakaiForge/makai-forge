import fs from "node:fs";
import path from "node:path";
import type { GameModule, ScriptExtenderRelease } from "../_shared/types";
import { deployBethesda } from "../_shared/bethesda-deploy";
import { restoreBethesda } from "../_shared/bethesda-restore";
import { KNOWN_TOOLS } from "../_shared/bethesda-constants";
import { makeBa2ArchiveHandler } from "../_shared/bethesda-archives";
import { FO4_VR_CONSTANTS, FO4_VR_EXE_NAMES, FO4_VR_DLL_OVERRIDES } from "./fallout4-vr.constants";

export function createFallout4VRModule(): GameModule {
  return {
    id: "fallout4_vr",
    displayName: "Fallout 4 VR",
    steamAppId: FO4_VR_CONSTANTS.steamAppId,
    altSteamAppIds: FO4_VR_CONSTANTS.altSteamAppIds,
    exeName: FO4_VR_CONSTANTS.exeName,
    preferredLaunchExe: FO4_VR_CONSTANTS.preferredLaunchExe,
    nexusDomain: FO4_VR_CONSTANTS.nexusDomain,
    lootType: FO4_VR_CONSTANTS.lootType,
    aliases: ["fo4vr"],
    detect: (gp) => FO4_VR_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => [".esp", ".esm", ".esl"],
    getWineDllOverrides: () => ({ ...FO4_VR_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["vcrun2022", "d3dcompiler_47"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Fallout 4 VR", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Fallout4 VR",
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["f4sevr_steam_loader.dll"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["f4sevr_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["f4sevr*.dll"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Fallout4 VR/Saves", extensions: [".fos"], flatten: true, toPrefix: true },
    ],
    getFrameworks: () => ({ "Script Extender": "f4sevr_loader.exe" }),
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: null,
      bsaVersion: null,
      archiveListKey: "SArchiveList",
      archiveListInPrefsIni: true,
      needsModBsas: false,
      modBsaExtensions: [".ba2"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "Fallout4.ini",
      prefsIniFilename: "Fallout4Prefs.ini",
    }),
    getScriptExtender: () => ({ name: "F4SEVR", pattern: /^f4sevr/i, installDir: "", dllPattern: /f4sevr/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "0.2.0",
      url: "https://github.com/llde/F4SEVR/releases/download/0.2.0/f4sevr_0_2_0.7z",
      loaderName: "f4sevr_loader.exe",
      dllPattern: /f4sevr_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "f4sevr_loader.exe");
    },
    getLaunchCommand: () => null,
    getArchiveHandlers: () => [makeBa2ArchiveHandler()],
    getExternalTools: () => KNOWN_TOOLS,
    deploy: async (gamePath, stagingDir, modlist, profile, prefixPath?, mode?) =>
      deployBethesda("fallout4_vr", gamePath, stagingDir, modlist, profile, prefixPath, mode),
    restore: async (gamePath, stagingDir, profile, prefixPath?) =>
      restoreBethesda({
        gamePath,
        gameId: "fallout4_vr",
        stagingDir,
        profile,
        prefixPath,
        myGamesSubpath: "Fallout4 VR",
      }),
  };
}
