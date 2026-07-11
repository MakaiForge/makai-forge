import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode, ScriptExtenderRelease } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { SKYRIM_CONSTANTS, SKYRIM_SE_EXE_NAMES } from "./skyrim.constants";
import { deploySkyrim, restoreSkyrim } from "./deploy";
export { deploySkyrimVariant, restoreSkyrimVariant } from "./deploy";
export type { SkyrimConstants } from "./deploy";
import { getSkyrimLaunchEnv } from "./launch";
import { getSkyrimDllOverrides, getSkyrimAutoInstallDeps, getSkyrimWinetricksComponents, seedSkyrimRegistry, getSkyrimMyGamesSubpath } from "./prefix";
import { getCustomRoutingRules } from "./routing";
import { getInvalidationConfig } from "./invalidation";
import { getSkyrimFrameworks, getPreferredLaunchExe } from "./frameworks";
import { getSkyrimTools } from "./tools";
import { PLUGIN_EXTENSIONS } from "./plugins";

export function createSkyrimModule(): GameModule {
  return {
    id: "skyrim",
    displayName: "Skyrim",
    steamAppId: SKYRIM_CONSTANTS.steamAppId,
    altSteamAppIds: SKYRIM_CONSTANTS.altSteamAppIds,
    exeName: SKYRIM_CONSTANTS.exeName,
    preferredLaunchExe: getPreferredLaunchExe(),
    nexusDomain: SKYRIM_CONSTANTS.nexusDomain,
    lootType: SKYRIM_CONSTANTS.lootType,
    aliases: ["skyrim legendary", "skyrim classic", "skyrimle"],
    detect: (gp) => SKYRIM_SE_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),

    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => PLUGIN_EXTENSIONS,
    getScriptExtender: () => ({
      name: "SKSE",
      pattern: /^skse/i,
      installDir: "",
      dllPattern: /skse/i,
    }),

    getWineDllOverrides: () => getSkyrimDllOverrides(),
    getAutoInstallDeps: () => getSkyrimAutoInstallDeps(),
    getWinetricksComponents: () => getSkyrimWinetricksComponents(),
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      return seedSkyrimRegistry(prefixPath, gamePath, protonPath, steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => getSkyrimMyGamesSubpath(),
    getCustomRoutingRules: (prefixPath?: string) => getCustomRoutingRules(prefixPath),
    getFrameworks: () => getSkyrimFrameworks(),
    getArchiveInvalidationConfig: () => getInvalidationConfig(),
    getExternalTools: () => getSkyrimTools(),

    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "1_07_03",
      url: "https://skse.silverlock.org/beta/skse_1_07_03.7z",
      loaderName: "skse_loader.exe",
      dllPattern: /skse_\d+_\d+_\d+\.dll/i,
    }),

    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "skse_loader.exe");
    },

    deploy: async (
      gamePath: string,
      stagingDir: string,
      modlist: ModlistEntry[],
      profile: string,
      prefixPath?: string,
      mode?: LinkMode,
    ): Promise<DeploymentResult> => {
      return deploySkyrim("skyrim", gamePath, stagingDir, modlist, profile, prefixPath, mode);
    },

    restore: async (
      gamePath: string,
      stagingDir: string,
      profile: string,
      prefixPath?: string,
    ): Promise<void> => {
      return restoreSkyrim("skyrim", gamePath, stagingDir, profile, prefixPath);
    },

    getLaunchCommand: () => null,
    getLaunchArgs: () => ["-windowed"],
    getLaunchEnv: (gamePath: string, prefixPath: string, protonPath?: string) => {
      return getSkyrimLaunchEnv(gamePath, prefixPath, protonPath);
    },

    getArchiveHandlers: () => [
      {
        ext: ".bsa",
        name: "BSA Archive",
        async extract(_archivePath: string, _targetDir: string) {
          throw new Error("BSA extraction not yet implemented");
        },
        async list(_archivePath: string) {
          return [];
        },
      },
    ],
  };
}
