import type { CustomRule } from "../_shared/types";

export function makeSavesRoutingRule(
  extension: string[],
  myGamesSubpath: string,
  prefixPath?: string,
): CustomRule {
  const dest = `drive_c/users/steamuser/Documents/My Games/${myGamesSubpath}/Saves`;
  return {
    dest,
    extensions: extension,
    flatten: true,
    toPrefix: true,
    mirrorDests: prefixPath && pathExists(prefixPath, `drive_c/users/steamuser/Documents/My Games/${myGamesSubpath} GOG/Saves`)
      ? [`drive_c/users/steamuser/Documents/My Games/${myGamesSubpath} GOG/Saves`]
      : [],
  };
}

function pathExists(...parts: string[]): string | undefined {
  try {
    const p = require("node:path");
    const fs = require("node:fs");
    if (fs.existsSync(p.join(...parts))) return "";
  } catch { /* */ }
  return undefined;
}

export function makeBsaArchiveHandler(): import("../_shared/types").ArchiveHandler {
  return {
    ext: ".bsa",
    name: "BSA Archive",
    async extract(_archivePath: string, _targetDir: string) {
      throw new Error("BSA extraction not yet implemented");
    },
    async list(_archivePath: string) {
      return [];
    },
  };
}

export function makeBa2ArchiveHandler(): import("../_shared/types").ArchiveHandler {
  return {
    ext: ".ba2",
    name: "BA2 Archive",
    async extract(_archivePath: string, _targetDir: string) {
      throw new Error("BA2 extraction not yet implemented");
    },
    async list(_archivePath: string) {
      return [];
    },
  };
}
