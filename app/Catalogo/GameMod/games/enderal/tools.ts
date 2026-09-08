import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "EnderalEdit", exeName: "EnderalEdit.exe", searchPaths: ["."], downloadUrl: "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z", detector: { file: "EnderalEdit.exe" } },
    { name: "LOOT", exeName: "LOOT.exe", searchPaths: ["."], downloadUrl: "https://github.com/loot/loot/releases/latest/download/loot_0.29.1-win64.7z", detector: { file: "LOOT.exe" } },
    { name: "Wrye Bash", exeName: "Wrye Bash.exe", searchPaths: ["."], downloadUrl: "https://github.com/Wrye-Bash/Wrye-Bash/releases/latest/download/Wrye.Bash.314.-.Standalone.Executable.7z", innerFolder: "Mopy", detector: { file: "Wrye Bash.exe" } },
    { name: "BethINI", exeName: "BethINI.exe", searchPaths: ["."] },
    { name: "FNIS", exeName: "FNIS.exe", searchPaths: ["."] },
    { name: "Nemesis", exeName: "Nemesis Unlimited Behavior Engine.exe", searchPaths: ["."] },
  ];
}
