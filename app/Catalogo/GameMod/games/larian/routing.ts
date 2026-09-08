import type { CustomRule } from "../_shared/types";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    // .pak mods → Mods/ folder (Larian AppData)
    { dest: "Mods", extensions: [".pak"], flatten: true, looseOnly: true },

    // Script Extender files → bin/
    { dest: "bin", extensions: [".dll", ".exe"], folders: ["bin"], looseOnly: true },

    // Generated data → Data/
    { dest: "Data", folders: ["generated", "public"], flatten: false },

    // Video overrides
    { dest: "Data/video", folders: ["video"], flatten: false },
  ];
}
