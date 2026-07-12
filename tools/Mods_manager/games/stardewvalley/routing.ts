import type { CustomRule } from "../_shared/types";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    // SMAPI mods → Mods/ folder
    // Each mod should be in its own subfolder
    { dest: "Mods", folders: ["Mods"], flatten: false, looseOnly: false },

    // Content packs for Alternative Textures
    { dest: "Mods", folders: ["Content"], flatten: false, looseOnly: true },
  ];
}
