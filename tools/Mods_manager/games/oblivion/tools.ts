import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "TES4Edit", exeName: "TES4Edit.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", innerFolder: "TES5Edit", detector: { file: "TES4Edit.exe" } },
    { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/LOOT.zip", innerFolder: "LOOT", detector: { file: "LOOT.exe" } },
    { name: "Wrye Bash", exeName: "Wrye Bash.exe", searchPaths: ["."], downloadUrl: "https://github.com/Wrye-Bash/Wrye-Bash/releases/latest/download/Wrye.Bash.314.-.7z", innerFolder: "Mopy", detector: { file: "Wrye Bash.exe" } },
    { name: "TES4LodGen", exeName: "TES4LodGen.exe", searchPaths: ["."] },
    { name: "Construction Set", exeName: "TESConstructionSet.exe", searchPaths: ["."] },
    { name: "zEdit", exeName: "zEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/z-edit/zedit/releases/download/0.6.7/zEdit_v0.6.7_-_Portable_x64.7z", innerFolder: "zEdit_x64", detector: { file: "zEdit.exe" } },
  ];
}
