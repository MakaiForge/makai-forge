import type { ArchiveInvalidationConfig } from "../_shared/types";

export function getInvalidationConfig(): ArchiveInvalidationConfig {
  return {
    enabled: true,
    bsaName: "Enderal - Invalidation.bsa",
    bsaVersion: 0x68,
    archiveListKey: "SArchiveList",
    archiveListInPrefsIni: true,
    needsModBsas: true,
    modBsaExtensions: [".bsa"],
    invalidationIniKey: "bInvalidateOlderFiles",
    iniFilename: "Enderal.ini",
    prefsIniFilename: "EnderalPrefs.ini",
  };
}
