import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode, ScriptExtenderRelease } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { createSkyrimModule, deploySkyrimVariant, restoreSkyrimVariant } from "../skyrim";
import type { SkyrimConstants } from "../skyrim";
import { SKYRIM_SE_CONSTANTS, SKYRIM_SE_EXE_NAMES, SKYRIM_SE_DLL_OVERRIDES } from "./skyrim-se.constants";

const SE_CONSTANTS: SkyrimConstants = {
  exeName: SKYRIM_SE_CONSTANTS.exeName,
  launcherName: SKYRIM_SE_CONSTANTS.launcherName,
  skseLoaderName: SKYRIM_SE_CONSTANTS.skseLoaderName,
  myGamesSubpath: SKYRIM_SE_CONSTANTS.myGamesSubpath,
  appDataSubpath: SKYRIM_SE_CONSTANTS.appDataSubpath,
};

export function createSkyrimSEModule(): GameModule {
  const base = createSkyrimModule();

  return {
    ...base,
    id: "skyrim_se",
    displayName: "Skyrim Special Edition",
    steamAppId: SKYRIM_SE_CONSTANTS.steamAppId,
    altSteamAppIds: SKYRIM_SE_CONSTANTS.altSteamAppIds,
    exeName: SKYRIM_SE_CONSTANTS.exeName,
    preferredLaunchExe: SKYRIM_SE_CONSTANTS.preferredLaunchExe,
    nexusDomain: SKYRIM_SE_CONSTANTS.nexusDomain,
    lootType: SKYRIM_SE_CONSTANTS.lootType,
    aliases: ["skyrim special edition", "sse", "skyrim se"],
    detect: (gp) => SKYRIM_SE_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),

    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Skyrim Special Edition", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Skyrim Special Edition",

    getWineDllOverrides: () => ({ ...SKYRIM_SE_DLL_OVERRIDES }),
    getWinetricksComponents: () => [],

    getFrameworks: () => ({
      "Script Extender": "skse64_loader.exe",
    }),

    getScriptExtender: () => ({
      name: "SKSE64",
      pattern: /^skse64/i,
      installDir: "",
      dllPattern: /skse64/i,
    }),
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

    deploy: async (
      gamePath: string, stagingDir: string, modlist: ModlistEntry[],
      profile: string, prefixPath?: string, mode?: LinkMode,
    ): Promise<DeploymentResult> => {
      return deploySkyrimVariant("skyrim_se", gamePath, stagingDir, modlist, profile, prefixPath, mode, SE_CONSTANTS);
    },

    restore: async (
      gamePath: string, stagingDir: string, profile: string, prefixPath?: string,
    ): Promise<void> => {
      return restoreSkyrimVariant("skyrim_se", gamePath, stagingDir, profile, prefixPath, SE_CONSTANTS);
    },
  };
}
