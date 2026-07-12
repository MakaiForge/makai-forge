import type { CustomRule } from "../_shared/types";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    // BepInEx core files → game root
    { dest: "", filenames: ["winhttp.dll", "doorstop_config.ini", ".doorstop_version"], looseOnly: true },

    // BepInEx config, core, patchers
    { dest: "BepInEx", folders: ["config", "core", "patchers"], looseOnly: true },

    // BepInEx plugins
    { dest: "BepInEx/plugins", folders: ["plugins"], flatten: true, looseOnly: true },

    // BepInEx BepInExPack files
    { dest: "BepInEx", folders: ["BepInEx"], flatten: false, looseOnly: true },
  ];
}
