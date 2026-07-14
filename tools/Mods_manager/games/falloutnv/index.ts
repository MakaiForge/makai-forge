import fs from "node:fs";
import path from "node:path";
import type { GameModule, ScriptExtenderRelease } from "../_shared/types";
import { deployBethesda } from "../_shared/bethesda-deploy";
import { restoreBethesda } from "../_shared/bethesda-restore";
import { KNOWN_TOOLS } from "../_shared/bethesda-constants";
import { makeBsaArchiveHandler } from "../_shared/bethesda-archives";
import { FNV_CONSTANTS, FNV_EXE_NAMES, FNV_DLL_OVERRIDES } from "./falloutnv.constants";

export function createFalloutNVModule(): GameModule {
  return {
    id: "falloutnv",
    displayName: "Fallout New Vegas",
    steamAppId: FNV_CONSTANTS.steamAppId,
    altSteamAppIds: FNV_CONSTANTS.altSteamAppIds,
    exeName: FNV_CONSTANTS.exeName,
    preferredLaunchExe: FNV_CONSTANTS.preferredLaunchExe,
    nexusDomain: FNV_CONSTANTS.nexusDomain,
    lootType: FNV_CONSTANTS.lootType,
    aliases: ["fnv", "new vegas"],
    detect: (gp) => FNV_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => [".esp", ".esm"],
    getWineDllOverrides: () => ({ ...FNV_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["d3dx9", "xact", "vcrun2019"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "FalloutNV", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "FalloutNV",
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["nvse_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["nvse*.dll"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["nvse*.pdb"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["FNVpatch.exe"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/FalloutNV/Saves", extensions: [".fos"], flatten: true, toPrefix: true },
    ],
    getFrameworks: () => ({ "Script Extender": "nvse_loader.exe" }),
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: "Fallout - Invalidation.bsa",
      bsaVersion: 0x68,
      archiveListKey: "SArchiveList",
      archiveListInPrefsIni: true,
      needsModBsas: true,
      modBsaExtensions: [".bsa"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "Fallout.ini",
      prefsIniFilename: "FalloutPrefs.ini",
      archiveListFixName: "JIP LN NVSE",
      archiveListFixPath: "Data/NVSE/Plugins/jip_nvse.dll",
    }),
    getScriptExtender: () => ({ name: "NVSE", pattern: /^nvse/i, installDir: "", dllPattern: /nvse/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "6.2.4",
      url: "https://github.com/llde/NVSE/releases/download/6.2.4/nvse_6_2_4.7z",
      loaderName: "nvse_loader.exe",
      dllPattern: /nvse_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "nvse_loader.exe");
    },
    getLaunchCommand: () => null,
    getArchiveHandlers: () => [makeBsaArchiveHandler()],
    getExternalTools: () => KNOWN_TOOLS,
    deploy: async (gamePath, stagingDir, modlist, profile, prefixPath?, mode?) =>
      deployBethesda("falloutnv", gamePath, stagingDir, modlist, profile, prefixPath, mode),
    restore: async (gamePath, stagingDir, profile, prefixPath?) =>
      restoreBethesda({
        gamePath,
        gameId: "falloutnv",
        stagingDir,
        profile,
        prefixPath,
        myGamesSubpath: "FalloutNV",
      }),
  };
}
