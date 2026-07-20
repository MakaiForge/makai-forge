import type { CustomRule } from "../_shared/types";
import { ENDERAL_CONSTANTS } from "./enderal.constants";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    { dest: "", filenames: ["d3dx9_42.dll"], flatten: true },
    { dest: "", filenames: ["d3dcompiler_47.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["skse_1*.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["skse_loader.exe"], flatten: true, looseOnly: true },
    { dest: "", folders: ["enbseries"], flatten: true },
    {
      dest: `drive_c/users/steamuser/Documents/My Games/${ENDERAL_CONSTANTS.myGamesSubpath}/Saves`,
      extensions: ENDERAL_CONSTANTS.saveExtension,
      flatten: true,
      toPrefix: true,
    },
  ];
}
