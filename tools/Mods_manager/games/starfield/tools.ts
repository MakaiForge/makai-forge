import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "SSEEdit", exeName: "SSEEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", innerFolder: "TES5Edit", detector: { file: "SSEEdit.exe" } },
    { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/LOOT.zip", innerFolder: "LOOT", detector: { file: "LOOT.exe" } },
    { name: "Creation Kit", exeName: "CreationKit.exe", searchPaths: ["."] },
    { name: "zEdit", exeName: "zEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/z-edit/zedit/releases/download/0.6.7/zEdit_v0.6.7_-_Portable_x64.7z", innerFolder: "zEdit_x64", detector: { file: "zEdit.exe" } },
    { name: "BethINI", exeName: "BethINI.exe", searchPaths: ["."] },
  ];
}
