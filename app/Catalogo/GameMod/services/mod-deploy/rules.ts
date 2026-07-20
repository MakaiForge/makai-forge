import path from "node:path";
import fs from "node:fs";

export interface DeployRule {
  targetSubdir: string;
  writePluginsTxt: boolean;
}

const GAME_DEPLOY_RULES: Record<string, DeployRule> = {
  witcher3: { targetSubdir: "", writePluginsTxt: false },
  cyberpunk2077: { targetSubdir: "archive/pc/mod", writePluginsTxt: false },
  minecraft: { targetSubdir: "mods", writePluginsTxt: false },
  stardewvalley: { targetSubdir: "Content", writePluginsTxt: false },
  terraria: { targetSubdir: "", writePluginsTxt: false },
  kerbalspaceprogram: { targetSubdir: "GameData", writePluginsTxt: false },
  subnautica: { targetSubdir: "", writePluginsTxt: false },
  valheim: { targetSubdir: "BepInEx/plugins", writePluginsTxt: false },
  thelongdark: { targetSubdir: "", writePluginsTxt: false },
  "7daystodie": { targetSubdir: "Mods", writePluginsTxt: false },
  projectzomboid: { targetSubdir: "", writePluginsTxt: false },
  factorio: { targetSubdir: "mods", writePluginsTxt: false },
  satisfactory: { targetSubdir: "", writePluginsTxt: false },
  rimworld: { targetSubdir: "", writePluginsTxt: false },
  dragonageorigins: { targetSubdir: "modules", writePluginsTxt: false },
  dragonage2: { targetSubdir: "packages/core/override", writePluginsTxt: false },
  masseffect: { targetSubdir: "BioGame/DLC", writePluginsTxt: false },
  xcom2: { targetSubdir: "XComGame/Mods", writePluginsTxt: false },
  battletech: { targetSubdir: "Mods", writePluginsTxt: false },
  bannerlord: { targetSubdir: "Modules", writePluginsTxt: false },
  larian: { targetSubdir: "Mods", writePluginsTxt: false },
};

const BETHESDA_GAME_IDS = new Set([
  "skyrim", "skyrim_se", "skyrim_vr",
  "fallout3", "falloutnv", "fallout4", "fallout4_vr",
  "oblivion", "morrowind",
  "starfield",
  "enderal", "enderal_se",
]);

export function getDeployTarget(gameId: string, gamePath: string): string {
  const normalized = gameId.toLowerCase().replace(/[\s_-]+/g, "");

  if (BETHESDA_GAME_IDS.has(normalized) || gameId.toLowerCase().includes("skyrim") || gameId.toLowerCase().includes("fallout") || gameId.toLowerCase().includes("oblivion")) {
    return path.join(gamePath, "Data");
  }

  for (const [key, rule] of Object.entries(GAME_DEPLOY_RULES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return rule.targetSubdir ? path.join(gamePath, rule.targetSubdir) : gamePath;
    }
  }

  return gamePath;
}

export function shouldWritePluginsTxt(gameId: string): boolean {
  const normalized = gameId.toLowerCase().replace(/[\s_-]+/g, "");
  if (BETHESDA_GAME_IDS.has(normalized) || gameId.toLowerCase().includes("skyrim") || gameId.toLowerCase().includes("fallout") || gameId.toLowerCase().includes("oblivion")) {
    return true;
  }
  return GAME_DEPLOY_RULES[normalized]?.writePluginsTxt ?? false;
}

export function detectGameTypeFromPath(gamePath: string): string | null {
  const gameExePatterns: Record<string, string[]> = {
    witcher3: ["witcher3.exe", "witcher3", "bin/witcher3.exe"],
    cyberpunk2077: ["cyberpunk2077.exe", "cyberpunk2077", "bin/x64/cyberpunk2077.exe"],
    minecraft: ["minecraft.exe", "minecraft-launcher"],
    stardewvalley: ["stardew valley.exe", "stardew valley"],
    valheim: ["valheim.exe", "valheim"],
    rimworld: ["rimworld.exe", "rimworld", "rimworldlinux"],
    factorio: ["factorio.exe", "factorio"],
    projectzomboid: ["projectzomboid64.exe", "projectzomboid"],
    bannerlord: ["bannerlord.exe", "bannerlord", "bin/win64_ shippingclient/bannerlord.exe"],
  };

  const entries: string[] = [];
  try { entries.push(...fs.readdirSync(gamePath)); } catch { /* empty */ }
  try { entries.push(...fs.readdirSync(path.join(gamePath, "bin")).map((e: string) => "bin/" + e)); } catch { /* empty */ }

  const lowerEntries = entries.map((e: string) => e.toLowerCase());

  for (const [gameId, patterns] of Object.entries(gameExePatterns)) {
    for (const pattern of patterns) {
      if (lowerEntries.includes(pattern.toLowerCase())) {
        return gameId;
      }
      if (lowerEntries.some((e: string) => e.includes(pattern.toLowerCase()))) {
        return gameId;
      }
    }
  }

  return null;
}
