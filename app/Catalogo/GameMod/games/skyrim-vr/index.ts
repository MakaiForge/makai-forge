import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode, ScriptExtenderRelease } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { createSkyrimModule, deploySkyrimVariant, restoreSkyrimVariant } from "../skyrim";
import type { SkyrimConstants } from "../skyrim";
import { SKYRIM_VR_CONSTANTS, SKYRIM_VR_EXE_NAMES, SKYRIM_VR_DLL_OVERRIDES } from "./skyrim-vr.constants";

const VR_CONSTANTS: SkyrimConstants = {
  exeName: SKYRIM_VR_CONSTANTS.exeName,
  launcherName: SKYRIM_VR_CONSTANTS.launcherName,
  skseLoaderName: SKYRIM_VR_CONSTANTS.skseLoaderName,
  myGamesSubpath: SKYRIM_VR_CONSTANTS.myGamesSubpath,
  appDataSubpath: SKYRIM_VR_CONSTANTS.appDataSubpath,
};

export function createSkyrimVRModule(): GameModule {
  const base = createSkyrimModule();

  return {
    ...base,
    id: "skyrim_vr",
    displayName: "Skyrim VR",
    steamAppId: SKYRIM_VR_CONSTANTS.steamAppId,
    altSteamAppIds: SKYRIM_VR_CONSTANTS.altSteamAppIds,
    exeName: SKYRIM_VR_CONSTANTS.exeName,
    preferredLaunchExe: SKYRIM_VR_CONSTANTS.preferredLaunchExe,
    nexusDomain: SKYRIM_VR_CONSTANTS.nexusDomain,
    lootType: SKYRIM_VR_CONSTANTS.lootType,
    aliases: ["skyrim vr"],
    detect: (gp) => SKYRIM_VR_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),

    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Skyrim VR", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Skyrim VR",

    getWineDllOverrides: () => ({ ...SKYRIM_VR_DLL_OVERRIDES }),
    getWinetricksComponents: () => [],

    getFrameworks: () => ({
      "Script Extender": "sksevr_loader.exe",
    }),

    getScriptExtender: () => ({
      name: "SKSEVR",
      pattern: /^sksevr/i,
      installDir: "",
      dllPattern: /sksevr64/i,
    }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "2_00_12",
      url: "https://skse.silverlock.org/beta/sksevr_2_00_12.7z",
      loaderName: "sksevr_loader.exe",
      dllPattern: /sksevr64_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return require("node:path").join(gamePath, "sksevr_loader.exe");
    },

    deploy: async (
      gamePath: string, stagingDir: string, modlist: ModlistEntry[],
      profile: string, prefixPath?: string, mode?: LinkMode,
    ): Promise<DeploymentResult> => {
      return deploySkyrimVariant("skyrim_vr", gamePath, stagingDir, modlist, profile, prefixPath, mode, VR_CONSTANTS);
    },

    restore: async (
      gamePath: string, stagingDir: string, profile: string, prefixPath?: string,
    ): Promise<void> => {
      return restoreSkyrimVariant("skyrim_vr", gamePath, stagingDir, profile, prefixPath, VR_CONSTANTS);
    },
  };
}
