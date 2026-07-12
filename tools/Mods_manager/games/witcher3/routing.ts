import type { CustomRule } from "../_shared/types";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    // Witcher 3 mods have "mods/" prefix folder
    { dest: "mods", folders: ["mods"], flatten: false },

    // DLC content
    { dest: "dlc", folders: ["dlc"], flatten: false },

    // Script mods (bin/ folder, Script Merger output)
    { dest: "", folders: ["bin"], flatten: false },

    // Content mods (content/ folder)
    { dest: "content", folders: ["content"], flatten: false },
  ];
}
