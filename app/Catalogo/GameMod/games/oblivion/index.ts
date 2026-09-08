import fs from "node:fs";
import path from "node:path";
import type { GameModule, ScriptExtenderRelease } from "../_shared/types";
import { deployBethesda } from "../_shared/bethesda-deploy";
import { restoreBethesda } from "../_shared/bethesda-restore";
import { KNOWN_TOOLS } from "../_shared/bethesda-constants";
import { makeBsaArchiveHandler } from "../_shared/bethesda-archives";
import { OBLIVION_CONSTANTS, OBLIVION_EXE_NAMES, OBLIVION_DLL_OVERRIDES } from "./oblivion.constants";

export function createOblivionModule(): GameModule {
  return {
    id: "oblivion",
    displayName: "Oblivion",
    steamAppId: OBLIVION_CONSTANTS.steamAppId,
    altSteamAppIds: OBLIVION_CONSTANTS.altSteamAppIds,
    exeName: OBLIVION_CONSTANTS.exeName,
    preferredLaunchExe: OBLIVION_CONSTANTS.preferredLaunchExe,
    nexusDomain: OBLIVION_CONSTANTS.nexusDomain,
    lootType: OBLIVION_CONSTANTS.lootType,
    aliases: ["oblivion goty"],
    detect: (gp) => OBLIVION_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => [".esp", ".esm"],
    getWineDllOverrides: () => ({ ...OBLIVION_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["d3dx9", "xact", "vcrun2019"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Oblivion", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Oblivion",
    getCustomRoutingRules: () => [
      { dest: "", filenames: ["obse_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["obse*.dll"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Oblivion/Saves", extensions: [".ess"], flatten: true, toPrefix: true },
    ],
    getFrameworks: () => ({ "Script Extender": "obse_loader.exe" }),
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: "Oblivion - Invalidation.bsa",
      bsaVersion: 0x67,
      archiveListKey: "SArchiveList",
      archiveListInPrefsIni: false,
      needsModBsas: false,
      modBsaExtensions: [".bsa"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "Oblivion.ini",
      prefsIniFilename: "OblivionPrefs.ini",
    }),
    getScriptExtender: () => ({ name: "OBSE", pattern: /^obse/i, installDir: "", dllPattern: /obse/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "21.0",
      url: "https://github.com/llde/OBSE/releases/download/21.0/obse_21_0.7z",
      loaderName: "obse_loader.exe",
      dllPattern: /obse_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "obse_loader.exe");
    },
    getLaunchCommand: () => null,
    getArchiveHandlers: () => [makeBsaArchiveHandler()],
    getExternalTools: () => KNOWN_TOOLS,
    deploy: async (gamePath, stagingDir, modlist, profile, prefixPath?, mode?) =>
      deployBethesda("oblivion", gamePath, stagingDir, modlist, profile, prefixPath, mode),
    restore: async (gamePath, stagingDir, profile, prefixPath?) =>
      restoreBethesda({
        gamePath,
        gameId: "oblivion",
        stagingDir,
        profile,
        prefixPath,
        myGamesSubpath: "Oblivion",
      }),
  };
}
