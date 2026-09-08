import type { ExternalToolDef } from "../_shared/types";

export const MORROWIND_TOOLS: ExternalToolDef[] = [
  { name: "TES3Edit", exeName: "TES3Edit.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", detector: { file: "TES3Edit.exe" } },
  { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/loot_0.29.1-win64.7z", detector: { file: "LOOT.exe" } },
  { name: "Wrye Mash", exeName: "Wrye Mash.exe", searchPaths: ["."] },
  { name: "Construction Set", exeName: "TESConstructionSet.exe", searchPaths: ["."] },
  { name: "MWSE", exeName: "mwse_loader.exe", searchPaths: ["."], downloadUrl: "https://github.com/MWSE/MWSE/releases/download/2.1/MWSE-2.1.7z", detector: { file: "mwse_loader.exe" } },
  { name: "MGE XE", exeName: "MGEXEgui.exe", searchPaths: ["."] },
];
