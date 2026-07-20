import type { CustomRule } from "../_shared/types";
import { ENDERAL_SE_CONSTANTS } from "./enderal-se.constants";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    { dest: "", filenames: ["d3dcompiler_47.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["d3d11.dll", "d3dcompiler_46e.dll"], flatten: true },
    { dest: "", filenames: ["skse64_1*.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["skse64_loader.exe"], flatten: true, looseOnly: true },
    { dest: "", folders: ["enbseries"], flatten: true },
    {
      dest: `drive_c/users/steamuser/Documents/My Games/${ENDERAL_SE_CONSTANTS.myGamesSubpath}/Saves`,
      extensions: ENDERAL_SE_CONSTANTS.saveExtension,
      flatten: true,
      toPrefix: true,
    },
  ];
}
