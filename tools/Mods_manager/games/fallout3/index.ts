import fs from "node:fs";
import path from "node:path";
import type { GameModule, ScriptExtenderRelease } from "../_shared/types";
import { deployBethesda } from "../_shared/bethesda-deploy";
import { restoreBethesda } from "../_shared/bethesda-restore";
import { KNOWN_TOOLS } from "../_shared/bethesda-constants";
import { makeBsaArchiveHandler } from "../_shared/bethesda-archives";
import { FO3_CONSTANTS, FO3_EXE_NAMES, FO3_DLL_OVERRIDES } from "./fallout3.constants";

export function createFallout3Module(): GameModule {
  return {
    id: "fallout3",
    displayName: "Fallout 3",
    steamAppId: FO3_CONSTANTS.steamAppId,
    altSteamAppIds: FO3_CONSTANTS.altSteamAppIds,
    exeName: FO3_CONSTANTS.exeName,
    preferredLaunchExe: FO3_CONSTANTS.preferredLaunchExe,
    nexusDomain: FO3_CONSTANTS.nexusDomain,
    lootType: FO3_CONSTANTS.lootType,
    aliases: ["fo3"],
    detect: (gp) => FO3_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => [".esp", ".esm"],
    getWineDllOverrides: () => ({ ...FO3_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["d3dx9", "xact", "vcrun2019"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Fallout3", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Fallout3",
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["fose_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["fose*.dll"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Fallout3/Saves", extensions: [".fos"], flatten: true, toPrefix: true },
    ],
    getFrameworks: () => ({ "Script Extender": "fose_loader.exe" }),
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: "Fallout - Invalidation.bsa",
      bsaVersion: 0x68,
      archiveListKey: "SArchiveList",
      archiveListInPrefsIni: true,
      needsModBsas: true,
      modBsaExtensions: [".bsa"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "FALLOUT.INI",
      prefsIniFilename: "FalloutPrefs.ini",
      archiveListFixName: "Command Extender",
      archiveListFixPath: "Data/FOSE/Plugins/CommandExtender.dll",
    }),
    getScriptExtender: () => ({ name: "FOSE", pattern: /^fose/i, installDir: "", dllPattern: /fose/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "4.2.2",
      url: "https://github.com/llde/FOSE/releases/download/4.2.2/fose_4_2_2.7z",
      loaderName: "fose_loader.exe",
      dllPattern: /fose_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "fose_loader.exe");
    },
    getLaunchCommand: () => null,
    getArchiveHandlers: () => [makeBsaArchiveHandler()],
    getExternalTools: () => KNOWN_TOOLS,
    deploy: async (gamePath, stagingDir, modlist, profile, prefixPath?, mode?) =>
      deployBethesda("fallout3", gamePath, stagingDir, modlist, profile, prefixPath, mode),
    restore: async (gamePath, stagingDir, profile, prefixPath?) =>
      restoreBethesda({
        gamePath,
        gameId: "fallout3",
        stagingDir,
        profile,
        prefixPath,
        myGamesSubpath: "Fallout3",
      }),
  };
}
