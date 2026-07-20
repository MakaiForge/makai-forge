import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "Script Merger", exeName: "ScriptMerger.exe", searchPaths: ["."] },
    { name: "Witcher 3 Mod Limit Fix", exeName: "", searchPaths: [] },
  ];
}
