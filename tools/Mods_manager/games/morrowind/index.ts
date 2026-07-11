import fs from "node:fs";
import path from "node:path";
import type { GameModule, LinkMode, ScriptExtenderRelease } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { MORROWIND_CONSTANTS, MORROWIND_EXE_NAMES, MORROWIND_DLL_OVERRIDES } from "./morrowind.constants";
import { deployMorrowind, restoreMorrowind } from "./deploy";
import { morrowindLaunchEnv } from "./launch";
import { MORROWIND_TOOLS } from "./tools";

export function createMorrowindModule(): GameModule {
  return {
    id: "morrowind",
    displayName: "Morrowind",
    steamAppId: MORROWIND_CONSTANTS.steamAppId,
    altSteamAppIds: MORROWIND_CONSTANTS.altSteamAppIds,
    exeName: MORROWIND_CONSTANTS.exeName,
    preferredLaunchExe: MORROWIND_CONSTANTS.preferredLaunchExe,
    nexusDomain: MORROWIND_CONSTANTS.nexusDomain,
    lootType: MORROWIND_CONSTANTS.lootType,
    aliases: ["tes3", "morrobland", "morrowind goty"],
    detect: (gp) => MORROWIND_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),

    getDeployTarget: (gp) => path.join(gp, "Data Files"),
    shouldWritePluginsTxt: () => false,
    getPluginExtensions: () => [".esp", ".esm"],
    getWineDllOverrides: () => ({ ...MORROWIND_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist"],
    getWinetricksComponents: () => ["d3dx9", "xact", "vcrun2019"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Morrowind", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => MORROWIND_CONSTANTS.myGamesSubpath,
    getCustomRoutingRules: () => [],
    getFrameworks: () => ({ "MGE XE": "MGEXEgui.exe" }),
    getArchiveInvalidationConfig: () => null,
    getScriptExtender: () => ({ name: "MWSE", pattern: /^mwse/i, installDir: "", dllPattern: /mwse/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "2.1",
      url: "https://github.com/MWSE/MWSE/releases/download/2.1/MWSE-2.1.7z",
      loaderName: "mwse_launcher.exe",
      dllPattern: /mwse_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "mwse_launcher.exe");
    },

    deploy: async (
      gamePath: string, stagingDir: string, modlist: ModlistEntry[],
      profile: string, prefixPath?: string, _mode?: LinkMode,
    ): Promise<DeploymentResult> => {
      return deployMorrowind(gamePath, stagingDir, modlist, profile, prefixPath);
    },

    restore: async (
      gamePath: string, stagingDir: string, profile: string, prefixPath?: string,
    ): Promise<void> => {
      return restoreMorrowind(gamePath, stagingDir, profile, prefixPath);
    },

    getLaunchCommand: () => null,
    getLaunchEnv: (gamePath: string, prefixPath: string, protonPath?: string) => {
      return morrowindLaunchEnv(gamePath, prefixPath, protonPath);
    },

    getArchiveHandlers: () => [],
    getExternalTools: () => MORROWIND_TOOLS,
  };
}
