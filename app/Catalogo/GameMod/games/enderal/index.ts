import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode, ScriptExtenderRelease } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { createSkyrimModule, deploySkyrimVariant, restoreSkyrimVariant } from "../skyrim";
import type { SkyrimConstants } from "../skyrim";
import { ENDERAL_CONSTANTS, ENDERAL_EXE_NAMES, ENDERAL_DLL_OVERRIDES } from "./enderal.constants";

const ER_CONSTANTS: SkyrimConstants = {
  exeName: ENDERAL_CONSTANTS.exeName,
  launcherName: ENDERAL_CONSTANTS.launcherName,
  skseLoaderName: ENDERAL_CONSTANTS.skseLoaderName,
  myGamesSubpath: ENDERAL_CONSTANTS.myGamesSubpath,
  appDataSubpath: ENDERAL_CONSTANTS.appDataSubpath,
  skipLauncherSwap: true,
};

export function createEnderalModule(): GameModule {
  const base = createSkyrimModule();
  return {
    ...base,
    id: "enderal",
    displayName: "Enderal",
    steamAppId: ENDERAL_CONSTANTS.steamAppId,
    altSteamAppIds: ENDERAL_CONSTANTS.altSteamAppIds,
    exeName: ENDERAL_CONSTANTS.exeName,
    preferredLaunchExe: ENDERAL_CONSTANTS.preferredLaunchExe,
    nexusDomain: ENDERAL_CONSTANTS.nexusDomain,
    lootType: ENDERAL_CONSTANTS.lootType,
    aliases: ["enderal legendary"],
    detect: (gp) => ENDERAL_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),

    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Enderal", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Enderal",
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "1_07_03",
      url: "https://skse.silverlock.org/beta/skse_1_07_03.7z",
      loaderName: "skse_loader.exe",
      dllPattern: /skse_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return require("node:path").join(gamePath, "skse_loader.exe");
    },
    getWineDllOverrides: () => ({ ...ENDERAL_DLL_OVERRIDES }),
    getPluginExtensions: () => [".esp", ".esm", ".esl"],
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: "Enderal - Invalidation.bsa",
      bsaVersion: 0x68,
      archiveListKey: "SArchiveList",
      archiveListInPrefsIni: true,
      needsModBsas: false,
      modBsaExtensions: [".bsa"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "Enderal.ini",
      prefsIniFilename: "EnderalPrefs.ini",
    }),
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["skse_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["skse*.dll"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Enderal/Saves", extensions: [".ess"], flatten: true, toPrefix: true },
    ],

    deploy: async (
      gamePath: string, stagingDir: string, modlist: ModlistEntry[],
      profile: string, prefixPath?: string, mode?: LinkMode,
    ): Promise<DeploymentResult> => {
      return deploySkyrimVariant("enderal", gamePath, stagingDir, modlist, profile, prefixPath, mode, ER_CONSTANTS);
    },

    restore: async (
      gamePath: string, stagingDir: string, profile: string, prefixPath?: string,
    ): Promise<void> => {
      return restoreSkyrimVariant("enderal", gamePath, stagingDir, profile, prefixPath, ER_CONSTANTS);
    },
  };
}
