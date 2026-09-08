import type { ExternalToolDef, ScriptExtenderDef } from "../_shared/types";

export const SE_PATTERNS: ScriptExtenderDef[] = [
  { name: "SKSE", pattern: /^skse/i, installDir: "", dllPattern: /skse/i },
  { name: "SKSE64", pattern: /^skse64/i, installDir: "", dllPattern: /skse64/i },
  { name: "F4SE", pattern: /^f4se/i, installDir: "", dllPattern: /f4se/i },
  { name: "NVSE", pattern: /^nvse/i, installDir: "", dllPattern: /nvse/i },
  { name: "FOSE", pattern: /^fose/i, installDir: "", dllPattern: /fose/i },
  { name: "OBSE", pattern: /^obse/i, installDir: "", dllPattern: /obse/i },
  { name: "SFSE", pattern: /^sfse/i, installDir: "", dllPattern: /sfse/i },
  { name: "MWSE", pattern: /^mwse/i, installDir: "", dllPattern: /mwse/i },
];

export const SE_REGEXES: RegExp[] = SE_PATTERNS.map(se => se.pattern);

export const KNOWN_TOOLS: ExternalToolDef[] = [
  { name: "SSEEdit", exeName: "SSEEdit.exe", searchPaths: ["."] },
  { name: "FNIS", exeName: "FNIS.exe", searchPaths: ["."] },
  { name: "BodySlide", exeName: "BodySlide.exe", searchPaths: ["."] },
  { name: "Outfit Studio", exeName: "OutfitStudio.exe", searchPaths: ["."] },
  { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."] },
  { name: "Wrye Bash", exeName: "Wrye Bash.exe", searchPaths: ["."] },
  { name: "Creation Kit", exeName: "CreationKit.exe", searchPaths: ["."] },
  { name: "zEdit", exeName: "zEdit.exe", searchPaths: ["."] },
  { name: "Cathedral Assets Optimizer", exeName: "CAO.exe", searchPaths: ["."] },
  { name: "Nemesis", exeName: "Nemesis Unlimited Behavior Engine.exe", searchPaths: ["."] },
  { name: "BethINI", exeName: "BethINI.exe", searchPaths: ["."] },
];
