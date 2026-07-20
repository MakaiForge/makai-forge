import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode, ScriptExtenderRelease } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { createSkyrimModule, deploySkyrimVariant, restoreSkyrimVariant } from "../skyrim";
import type { SkyrimConstants } from "../skyrim";
import { ENDERAL_SE_CONSTANTS, ENDERAL_SE_EXE_NAMES, ENDERAL_SE_DLL_OVERRIDES } from "./enderal-se.constants";

const ES_CONSTANTS: SkyrimConstants = {
  exeName: ENDERAL_SE_CONSTANTS.exeName,
  launcherName: ENDERAL_SE_CONSTANTS.launcherName,
  skseLoaderName: ENDERAL_SE_CONSTANTS.skseLoaderName,
  myGamesSubpath: ENDERAL_SE_CONSTANTS.myGamesSubpath,
  appDataSubpath: ENDERAL_SE_CONSTANTS.appDataSubpath,
  skipLauncherSwap: true,
};

export function createEnderalSEModule(): GameModule {
  const base = createSkyrimModule();
  return {
    ...base,
    id: "enderal_se",
    displayName: "Enderal SE",
    steamAppId: ENDERAL_SE_CONSTANTS.steamAppId,
    altSteamAppIds: ENDERAL_SE_CONSTANTS.altSteamAppIds,
    exeName: ENDERAL_SE_CONSTANTS.exeName,
    preferredLaunchExe: ENDERAL_SE_CONSTANTS.preferredLaunchExe,
    nexusDomain: ENDERAL_SE_CONSTANTS.nexusDomain,
    lootType: ENDERAL_SE_CONSTANTS.lootType,
    aliases: ["enderalse", "enderal special edition"],
    detect: (gp) => ENDERAL_SE_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),

    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Enderal Special Edition", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Enderal Special Edition",
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "2_02_06",
      url: "https://skse.silverlock.org/beta/skse64_2_02_06.7z",
      loaderName: "skse64_loader.exe",
      dllPattern: /skse64_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return require("node:path").join(gamePath, "skse64_loader.exe");
    },
    getWineDllOverrides: () => ({ ...ENDERAL_SE_DLL_OVERRIDES }),
    getWinetricksComponents: () => [],
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: null,
      bsaVersion: null,
      archiveListKey: "SArchiveList",
      archiveListInPrefsIni: true,
      needsModBsas: false,
      modBsaExtensions: [".bsa"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "Skyrim.ini",
      prefsIniFilename: "SkyrimPrefs.ini",
    }),
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["skse64_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["skse64*.dll"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Enderal Special Edition/Saves", extensions: [".ess"], flatten: true, toPrefix: true },
    ],

    deploy: async (
      gamePath: string, stagingDir: string, modlist: ModlistEntry[],
      profile: string, prefixPath?: string, mode?: LinkMode,
    ): Promise<DeploymentResult> => {
      return deploySkyrimVariant("enderal_se", gamePath, stagingDir, modlist, profile, prefixPath, mode, ES_CONSTANTS);
    },

    restore: async (
      gamePath: string, stagingDir: string, profile: string, prefixPath?: string,
    ): Promise<void> => {
      return restoreSkyrimVariant("enderal_se", gamePath, stagingDir, profile, prefixPath, ES_CONSTANTS);
    },
  };
}
