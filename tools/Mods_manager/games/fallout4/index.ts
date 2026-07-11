import fs from "node:fs";
import path from "node:path";
import type { GameModule, ScriptExtenderRelease } from "../_shared/types";
import { deployBethesda } from "../_shared/bethesda-deploy";
import { restoreBethesda } from "../_shared/bethesda-restore";
import { KNOWN_TOOLS } from "../_shared/bethesda-constants";
import { makeBa2ArchiveHandler } from "../_shared/bethesda-archives";
import { FO4_CONSTANTS, FO4_EXE_NAMES, FO4_DLL_OVERRIDES } from "./fallout4.constants";

export function createFallout4Module(): GameModule {
  return {
    id: "fallout4",
    displayName: "Fallout 4",
    steamAppId: FO4_CONSTANTS.steamAppId,
    altSteamAppIds: FO4_CONSTANTS.altSteamAppIds,
    exeName: FO4_CONSTANTS.exeName,
    preferredLaunchExe: FO4_CONSTANTS.preferredLaunchExe,
    nexusDomain: FO4_CONSTANTS.nexusDomain,
    lootType: FO4_CONSTANTS.lootType,
    aliases: ["fo4"],
    detect: (gp) => FO4_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => [".esp", ".esm", ".esl"],
    getWineDllOverrides: () => ({ ...FO4_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["vcrun2022", "d3dcompiler_47"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Fallout4", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Fallout4",
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["f4se_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["f4se*.dll"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["CustomControlMap.txt"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Fallout4/Saves", extensions: [".fos"], flatten: true, toPrefix: true },
    ],
    getFrameworks: () => ({ "Script Extender": "f4se_loader.exe" }),
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
    getScriptExtender: () => ({ name: "F4SE", pattern: /^f4se/i, installDir: "", dllPattern: /f4se/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "0.6.21",
      url: "https://f4se.silverlock.org/beta/f4se_0_6_21.7z",
      loaderName: "f4se_loader.exe",
      dllPattern: /f4se_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "f4se_loader.exe");
    },
    getLaunchCommand: () => null,
    getArchiveHandlers: () => [makeBa2ArchiveHandler()],
    getExternalTools: () => KNOWN_TOOLS,
    deploy: async (gamePath, stagingDir, modlist, profile, prefixPath?, mode?) =>
      deployBethesda("fallout4", gamePath, stagingDir, modlist, profile, prefixPath, mode),
    restore: async (gamePath, stagingDir, profile, prefixPath?) =>
      restoreBethesda({
        gamePath,
        gameId: "fallout4",
        stagingDir,
        profile,
        prefixPath,
        myGamesSubpath: "Fallout4",
      }),
  };
}
