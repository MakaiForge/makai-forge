import fs from "node:fs";
import path from "node:path";
import type { GameModule, ScriptExtenderRelease } from "../_shared/types";
import { deployBethesda } from "../_shared/bethesda-deploy";
import { restoreBethesda } from "../_shared/bethesda-restore";
import { KNOWN_TOOLS } from "../_shared/bethesda-constants";
import { makeBa2ArchiveHandler } from "../_shared/bethesda-archives";
import { STARFIELD_CONSTANTS, STARFIELD_EXE_NAMES, STARFIELD_DLL_OVERRIDES } from "./starfield.constants";

export function createStarfieldModule(): GameModule {
  return {
    id: "starfield",
    displayName: "Starfield",
    steamAppId: STARFIELD_CONSTANTS.steamAppId,
    altSteamAppIds: STARFIELD_CONSTANTS.altSteamAppIds,
    exeName: STARFIELD_CONSTANTS.exeName,
    preferredLaunchExe: STARFIELD_CONSTANTS.preferredLaunchExe,
    nexusDomain: STARFIELD_CONSTANTS.nexusDomain,
    lootType: STARFIELD_CONSTANTS.lootType,
    aliases: ["starfield"],
    detect: (gp) => STARFIELD_EXE_NAMES.some(e => fs.existsSync(path.join(gp, e))),
    getDeployTarget: (gp) => path.join(gp, "Data"),
    shouldWritePluginsTxt: () => true,
    getPluginExtensions: () => [".esp", ".esm", ".esl"],
    getWineDllOverrides: () => ({ ...STARFIELD_DLL_OVERRIDES }),
    getAutoInstallDeps: () => ["vcredist", "d3dcompiler_47"],
    getWinetricksComponents: () => ["vcrun2022", "d3dcompiler_47"],
    seedRegistry: (prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string) => {
      const { seedBethesdaRegistryWithProton } = require("../_shared/prefix");
      return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Starfield", steamAppId, libraryPath);
    },
    getMyGamesSubpath: () => "Starfield",
    getCustomRoutingRules: (_prefixPath?: string) => [
      { dest: "", filenames: ["sfse_loader.exe"], flatten: true, looseOnly: true },
      { dest: "", filenames: ["sfse*.dll"], flatten: true, looseOnly: true },
      { dest: "", folders: ["Data"], flatten: true, looseOnly: true },
      { dest: "drive_c/users/steamuser/Documents/My Games/Starfield/Saves", extensions: [".sfs"], flatten: true, toPrefix: true },
    ],
    getFrameworks: () => ({ "Script Extender": "sfse_loader.exe" }),
    getArchiveInvalidationConfig: () => ({
      enabled: true,
      bsaName: null,
      bsaVersion: null,
      archiveListKey: "SResourceArchiveList",
      archiveListInPrefsIni: false,
      needsModBsas: true,
      modBsaExtensions: [".ba2"],
      invalidationIniKey: "bInvalidateOlderFiles",
      iniFilename: "StarfieldCustom.ini",
      prefsIniFilename: "StarfieldPrefs.ini",
    }),
    getScriptExtender: () => ({ name: "SFSE", pattern: /^sfse/i, installDir: "", dllPattern: /sfse/i }),
    getScriptExtenderRelease: (): ScriptExtenderRelease => ({
      version: "0.2.6",
      url: "https://sfse.silverlock.org/beta/sfse_0_2_6.7z",
      loaderName: "sfse_loader.exe",
      dllPattern: /sfse_\d+_\d+_\d+\.dll/i,
    }),
    getLaunchExe: (gamePath: string, hasSkse: boolean, sksePath?: string): string | null => {
      if (hasSkse && sksePath) return sksePath;
      return path.join(gamePath, "sfse_loader.exe");
    },
    getLaunchCommand: () => null,
    getArchiveHandlers: () => [makeBa2ArchiveHandler()],
    getExternalTools: () => KNOWN_TOOLS,
    deploy: async (gamePath, stagingDir, modlist, profile, prefixPath?, mode?) =>
      deployBethesda("starfield", gamePath, stagingDir, modlist, profile, prefixPath, mode),
    restore: async (gamePath, stagingDir, profile, prefixPath?) =>
      restoreBethesda({
        gamePath,
        gameId: "starfield",
        stagingDir,
        profile,
        prefixPath,
        myGamesSubpath: "Starfield",
      }),
  };
}
