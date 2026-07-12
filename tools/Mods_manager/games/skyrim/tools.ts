import type { ExternalToolDef } from "../_shared/types";

export function getSkyrimTools(): ExternalToolDef[] {
  return [
    { name: "SSEEdit", exeName: "SSEEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", innerFolder: "TES5Edit", detector: { file: "SSEEdit.exe" } },
    { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/LOOT.zip", innerFolder: "LOOT", detector: { file: "LOOT.exe" } },
    { name: "Wrye Bash", exeName: "Wrye Bash.exe", searchPaths: ["."], downloadUrl: "https://github.com/Wrye-Bash/Wrye-Bash/releases/latest/download/Wrye.Bash.314.-.7z", innerFolder: "Mopy", detector: { file: "Wrye Bash.exe" } },
    { name: "zEdit", exeName: "zEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/z-edit/zedit/releases/download/0.6.7/zEdit_v0.6.7_-_Portable_x64.7z", innerFolder: "zEdit_x64", detector: { file: "zEdit.exe" } },
    { name: "ESLifier", exeName: "ESLifier.exe", searchPaths: ["."], downloadUrl: "https://github.com/MaskPlague/ESLifier/releases/download/v0.15.3/ESLifier.zip", innerFolder: "ESLifier", detector: { file: "ESLifier.exe" } },
    { name: "Pandora Behavior Engine+", exeName: "Pandora Behaviour Engine+.exe", searchPaths: ["."], downloadUrl: "https://github.com/Monitor221hz/Pandora-Behaviour-Engine-Plus/releases/latest/download/Pandora_Behaviour_Engine_Plus_v4.3.1-beta.zip", innerFolder: "Pandora", detector: { file: "Pandora Behaviour Engine+.exe" } },
    { name: "FNIS", exeName: "FNIS.exe", searchPaths: ["."] },
    { name: "BodySlide", exeName: "BodySlide.exe", searchPaths: ["."] },
    { name: "Outfit Studio", exeName: "OutfitStudio.exe", searchPaths: ["."] },
    { name: "Creation Kit", exeName: "CreationKit.exe", searchPaths: ["."] },
    { name: "Cathedral Assets Optimizer", exeName: "CAO.exe", searchPaths: ["."] },
    { name: "Nemesis", exeName: "Nemesis Unlimited Behavior Engine.exe", searchPaths: ["."] },
    { name: "BethINI", exeName: "BethINI.exe", searchPaths: ["."] },
    { name: "DynDOLOD", exeName: "DynDOLODx64.exe", searchPaths: ["."] },
    { name: "TexGen", exeName: "TexGenx64.exe", searchPaths: ["."] },
    { name: "xLODGen", exeName: "xLODGenx64.exe", searchPaths: ["."] },
    { name: "VRAMr", exeName: "VRAMr.exe", searchPaths: ["."] },
    { name: "BENDr", exeName: "BENDr.exe", searchPaths: ["."] },
    { name: "ParallaxR", exeName: "ParallaxR.exe", searchPaths: ["."] },
  ];
}
