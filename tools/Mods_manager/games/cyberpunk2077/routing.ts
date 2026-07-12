import type { CustomRule } from "../_shared/types";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    // .archive mods → archive/pc/mod/
    { dest: "archive/pc/mod", extensions: [".archive"], flatten: true, looseOnly: true },

    // Script mods (.reds) → r6/scripts/
    { dest: "r6/scripts", extensions: [".reds"], looseOnly: true },

    // Tweak mods (.tweak) → r6/tweaks/
    { dest: "r6/tweaks", extensions: [".tweak"], looseOnly: true },

    // CET / ASI / DLL plugins → bin/x64/plugins/
    { dest: "bin/x64/plugins", extensions: [".asi", ".dll"], looseOnly: true },

    // RED4ext mods → red4ext/plugins/
    { dest: "red4ext/plugins", extensions: [".dll"], folders: ["red4ext"], looseOnly: true },

    // Config files → engine/config/
    { dest: "engine/config", extensions: [".ini", ".json", ".xml"], folders: ["engine"], looseOnly: true },
  ];
}
