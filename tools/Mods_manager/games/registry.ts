import type { GameModule, LinkMode } from "./_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { genericModule, deployGeneric, deployGenericWithRouting } from "./generic";

import { createSkyrimModule } from "./skyrim";
import { createSkyrimSEModule } from "./skyrim-se";
import { createSkyrimVRModule } from "./skyrim-vr";
import { createFallout3Module } from "./fallout3";
import { createFalloutNVModule } from "./falloutnv";
import { createFallout4Module } from "./fallout4";
import { createFallout4VRModule } from "./fallout4-vr";
import { createOblivionModule } from "./oblivion";
import { createMorrowindModule } from "./morrowind";
import { createStarfieldModule } from "./starfield";
import { createEnderalModule } from "./enderal";
import { createEnderalSEModule } from "./enderal-se";
import { createWitcher3Module } from "./witcher3";
import { createCyberpunk2077Module } from "./cyberpunk2077";
import { createBaldursGate3Module } from "./larian";
import { createMinecraftModule } from "./minecraft";
import { createStardewvalleyModule } from "./stardewvalley";
import { createValheimModule } from "./valheim";
import { createRimworldModule } from "./rimworld";
import { createFactorioModule } from "./factorio";
import { createProjectzomboidModule } from "./projectzomboid";
import { createBannerlordModule } from "./bannerlord";
import { create7daystodieModule } from "./7daystodie";
import { createSubnauticaModule } from "./subnautica";
import { createThelongdarkModule } from "./thelongdark";
import { createSatisfactoryModule } from "./satisfactory";
import { createTerrariaModule } from "./terraria";
import { createDonotfeedthemonkeysModule } from "./donotfeedthemonkeys";
import { createKerbalspaceprogramModule } from "./kerbalspaceprogram";
import { createBattletechModule } from "./battletech";
import { createDragonageoriginsModule } from "./dragonageorigins";
import { createDragonage2Module } from "./dragonage2";
import { createMasseffectModule } from "./masseffect";
import { createXcom2Module } from "./xcom2";

export interface KnownGameEntry {
  gameId: string
  name: string
  steamAppId?: string
  exeName?: string
  nexusDomain?: string
  lootType?: string
  dataFolder?: string
}

interface RegistryEntry {
  create: () => GameModule
  info: KnownGameEntry
}

const REGISTRY = new Map<string, RegistryEntry>();

function reg(id: string, create: () => GameModule, info: KnownGameEntry) {
  REGISTRY.set(id.toLowerCase().replace(/[\s_-]+/g, ""), { create, info });
}

reg("skyrim", createSkyrimModule, { gameId: "skyrim", name: "Skyrim", steamAppId: "72850", exeName: "SkyrimLauncher.exe", nexusDomain: "skyrim", lootType: "Skyrim", dataFolder: "Data" });
reg("skyrim_se", createSkyrimSEModule, { gameId: "skyrim_se", name: "Skyrim Special Edition", steamAppId: "489830", exeName: "SkyrimSE.exe", nexusDomain: "skyrimspecialedition", lootType: "SkyrimSE", dataFolder: "Data" });
reg("skyrim_vr", createSkyrimVRModule, { gameId: "skyrim_vr", name: "Skyrim VR", steamAppId: "611670", exeName: "SkyrimVR.exe", nexusDomain: "skyrim", lootType: "SkyrimVR", dataFolder: "Data" });
reg("fallout3", createFallout3Module, { gameId: "fallout3", name: "Fallout 3", steamAppId: "22300", exeName: "Fallout3Launcher.exe", nexusDomain: "fallout3", lootType: "Fallout3", dataFolder: "Data" });
reg("falloutnv", createFalloutNVModule, { gameId: "falloutnv", name: "Fallout New Vegas", steamAppId: "22380", exeName: "FalloutNVLauncher.exe", nexusDomain: "newvegas", lootType: "FalloutNV", dataFolder: "Data" });
reg("fallout4", createFallout4Module, { gameId: "fallout4", name: "Fallout 4", steamAppId: "377160", exeName: "Fallout4Launcher.exe", nexusDomain: "fallout4", lootType: "Fallout4", dataFolder: "Data" });
reg("fallout4_vr", createFallout4VRModule, { gameId: "fallout4_vr", name: "Fallout 4 VR", steamAppId: "611660", exeName: "Fallout4VR.exe", nexusDomain: "fallout4", lootType: "Fallout4VR", dataFolder: "Data" });
reg("oblivion", createOblivionModule, { gameId: "oblivion", name: "Oblivion", steamAppId: "22330", exeName: "OblivionLauncher.exe", nexusDomain: "oblivion", lootType: "Oblivion", dataFolder: "Data" });
reg("morrowind", createMorrowindModule, { gameId: "morrowind", name: "Morrowind", steamAppId: "22320", exeName: "Morrowind Launcher.exe", nexusDomain: "morrowind", lootType: "Morrowind", dataFolder: "Data" });
reg("starfield", createStarfieldModule, { gameId: "starfield", name: "Starfield", steamAppId: "1716740", exeName: "Starfield.exe", nexusDomain: "starfield", lootType: "Starfield", dataFolder: "Data" });
reg("enderal", createEnderalModule, { gameId: "enderal", name: "Enderal", steamAppId: "933480", exeName: "Enderal Launcher.exe", nexusDomain: "enderal", lootType: "Enderal", dataFolder: "Data" });
reg("enderal_se", createEnderalSEModule, { gameId: "enderal_se", name: "Enderal SE", steamAppId: "976620", exeName: "Enderal Launcher.exe", nexusDomain: "enderal", lootType: "EnderalSE", dataFolder: "Data" });
reg("witcher3", createWitcher3Module, { gameId: "witcher3", name: "The Witcher 3: Wild Hunt", steamAppId: "292030", exeName: "bin/x64/witcher3.exe", nexusDomain: "witcher3" });
reg("cyberpunk2077", createCyberpunk2077Module, { gameId: "cyberpunk2077", name: "Cyberpunk 2077", steamAppId: "1091500", exeName: "bin/x64/Cyberpunk2077.exe", nexusDomain: "cyberpunk2077" });
reg("larian", createBaldursGate3Module, { gameId: "larian", name: "Baldur's Gate 3", steamAppId: "1086940", exeName: "bg3.exe", nexusDomain: "baldursgate3" });
reg("minecraft", createMinecraftModule, { gameId: "minecraft", name: "Minecraft (Java)", steamAppId: "", exeName: "" });
reg("stardewvalley", createStardewvalleyModule, { gameId: "stardewvalley", name: "Stardew Valley", steamAppId: "413150", exeName: "StardewValley", nexusDomain: "stardewvalley" });
reg("valheim", createValheimModule, { gameId: "valheim", name: "Valheim", steamAppId: "892970", exeName: "valheim.x86_64", nexusDomain: "valheim" });
reg("rimworld", createRimworldModule, { gameId: "rimworld", name: "RimWorld", steamAppId: "294100", exeName: "RimWorldLinux", nexusDomain: "rimworld" });
reg("factorio", createFactorioModule, { gameId: "factorio", name: "Factorio", steamAppId: "427520", exeName: "factorio" });
reg("projectzomboid", createProjectzomboidModule, { gameId: "projectzomboid", name: "Project Zomboid", steamAppId: "108600", exeName: "ProjectZomboid64", nexusDomain: "projectzomboid" });
reg("bannerlord", createBannerlordModule, { gameId: "bannerlord", name: "Mount & Blade II: Bannerlord", steamAppId: "261550", nexusDomain: "mountandblade2bannerlord" });
reg("7daystodie", create7daystodieModule, { gameId: "7daystodie", name: "7 Days to Die", steamAppId: "251570", exeName: "7DaysToDie_EAC", nexusDomain: "7daystodie" });
reg("subnautica", createSubnauticaModule, { gameId: "subnautica", name: "Subnautica", steamAppId: "264710", exeName: "Subnautica.x86_64", nexusDomain: "subnautica" });
reg("thelongdark", createThelongdarkModule, { gameId: "thelongdark", name: "The Long Dark", steamAppId: "305620", exeName: "TLD.x86_64", nexusDomain: "thelongdark" });
reg("satisfactory", createSatisfactoryModule, { gameId: "satisfactory", name: "Satisfactory", steamAppId: "526870", exeName: "FactoryGame.exe", nexusDomain: "satisfactory" });
reg("terraria", createTerrariaModule, { gameId: "terraria", name: "Terraria", steamAppId: "105600", exeName: "Terraria" });
reg("donotfeedthemonkeys", createDonotfeedthemonkeysModule, { gameId: "donotfeedthemonkeys", name: "Do Not Feed the Monkeys", steamAppId: "658850" });
reg("kerbalspaceprogram", createKerbalspaceprogramModule, { gameId: "kerbalspaceprogram", name: "Kerbal Space Program", steamAppId: "220200", exeName: "KSP_x64.exe", nexusDomain: "kerbalspaceprogram" });
reg("battletech", createBattletechModule, { gameId: "battletech", name: "BattleTech", steamAppId: "637090", exeName: "BattleTech.exe", nexusDomain: "battletech" });
reg("dragonageorigins", createDragonageoriginsModule, { gameId: "dragonageorigins", name: "Dragon Age: Origins", steamAppId: "17450", exeName: "bin_ship/DAOrigins.exe", nexusDomain: "dragonage" });
reg("dragonage2", createDragonage2Module, { gameId: "dragonage2", name: "Dragon Age II", steamAppId: "1238040", exeName: "bin_ship/DragonAge2.exe", nexusDomain: "dragonage2" });
reg("masseffect", createMasseffectModule, { gameId: "masseffect", name: "Mass Effect (Legendary)", steamAppId: "1328670", exeName: "MassEffectLauncher.exe", nexusDomain: "masseffect" });
reg("xcom2", createXcom2Module, { gameId: "xcom2", name: "XCOM 2", steamAppId: "268500", exeName: "XCom2.exe", nexusDomain: "xcom2" });

function normalize(gameId: string): string {
  return gameId.toLowerCase().replace(/[\s_-]+/g, "");
}

export function listKnownGames(): KnownGameEntry[] {
  const entries: KnownGameEntry[] = [];
  for (const [, entry] of REGISTRY) {
    entries.push(entry.info);
  }
  return entries;
}

export function getGameModule(gameId: string, gamePath: string = ""): GameModule {
  const n = normalize(gameId);
  const entry = REGISTRY.get(n);
  if (entry) return entry.create();

  return genericModule(gameId, gamePath);
}

export function getDeployFunction(
  gameId: string
): (gameId: string, gamePath: string, stagingDir: string, modlist: ModlistEntry[], profile: string, prefixPath?: string, mode?: LinkMode) => Promise<DeploymentResult> {
  const mod = getGameModule(gameId, "");
  const deploy = mod.deploy;
  if (deploy) return (_gameId: string, gamePath: string, ...args: [string, ModlistEntry[], string, string?, LinkMode?]) => deploy(gamePath, ...args);

  // For generic games, wrap deployGeneric with routing rules from the game module
  const routingRules = mod.getCustomRoutingRules?.() || [];
  const filemapCasing = mod.filemapCasing;
  if (routingRules.length > 0) {
    return (_gameId: string, gamePath: string, stagingDir: string, modlist: ModlistEntry[], profile: string, prefixPath?: string, mode?: LinkMode) =>
      deployGenericWithRouting(gamePath, stagingDir, modlist, profile, prefixPath, mode, routingRules, filemapCasing);
  }

  return (gameId: string, gamePath: string, stagingDir: string, modlist: ModlistEntry[], profile: string, prefixPath?: string, mode?: LinkMode) =>
    deployGeneric(gameId, gamePath, stagingDir, modlist, profile, prefixPath, mode, filemapCasing);
}

export function getRestoreFunction(
  gameId: string
): (gamePath: string, stagingDir: string, profile: string, prefixPath?: string) => Promise<void> {
  const n = normalize(gameId);
  const entry = REGISTRY.get(n);
  if (entry) {
    const mod = entry.create();
    if (mod.restore) return mod.restore;
  }
  return async () => {};
}

export function getGameInfo(gameId: string): KnownGameEntry | null {
  const entry = REGISTRY.get(normalize(gameId));
  return entry?.info ?? null;
}
