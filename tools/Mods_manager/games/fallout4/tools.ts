import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "SSEEdit", exeName: "SSEEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", detector: { file: "SSEEdit.exe" } },
    { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/LOOT.zip", detector: { file: "LOOT.exe" } },
    { name: "Wrye Bash", exeName: "Wrye Bash.exe", searchPaths: ["."], downloadUrl: "https://github.com/Wrye-Bash/Wrye-Bash/releases/latest/download/Wrye.Bash.314.-.7z", detector: { file: "Wrye Bash.exe" } },
    { name: "zEdit", exeName: "zEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/z-edit/zedit/releases/download/0.6.7/zEdit_v0.6.7_-_Portable_x64.7z", detector: { file: "zEdit.exe" } },
    { name: "Creation Kit", exeName: "CreationKit.exe", searchPaths: ["."] },
    { name: "BodySlide", exeName: "BodySlide.exe", searchPaths: ["."] },
    { name: "Outfit Studio", exeName: "OutfitStudio.exe", searchPaths: ["."] },
    { name: "Cathedral Assets Optimizer", exeName: "CAO.exe", searchPaths: ["."] },
    { name: "BethINI", exeName: "BethINI.exe", searchPaths: ["."] },
  ];
}
