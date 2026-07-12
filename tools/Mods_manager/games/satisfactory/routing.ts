import type { CustomRule } from "../_shared/types";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    // SML (Satisfactory Mod Loader) files → game root
    { dest: "", filenames: ["winhttp.dll", "doorstop_config.ini", ".doorstop_version"], looseOnly: true },

    // SML bootstrap
    { dest: "SML", folders: ["SML"], flatten: false, looseOnly: true },

    // Ficsit mods → Mods/ folder
    { dest: "Mods", extensions: [".dll", ".pak"], flatten: true, looseOnly: true },
  ];
}
