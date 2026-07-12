import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "FO3Edit", exeName: "xFOEdit64.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", detector: { file: "xFOEdit64.exe" } },
    { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/loot_0.29.1-win64.7z", detector: { file: "LOOT.exe" } },
    { name: "Wrye Flash", exeName: "Wrye Flash.exe", searchPaths: ["."] },
    { name: "GECK", exeName: "GECK.exe", searchPaths: ["."] },
    { name: "zEdit", exeName: "zEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/z-edit/zedit/releases/download/0.6.7/zEdit_v0.6.7_-_Portable_x64.7z", detector: { file: "zEdit.exe" } },
  ];
}
