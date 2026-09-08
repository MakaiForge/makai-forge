import type { CustomRule } from "../_shared/types";
import { SKYRIM_VR_CONSTANTS } from "./skyrim-vr.constants";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    { dest: "", filenames: ["d3dcompiler_47.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["d3d11.dll", "d3dcompiler_46e.dll"], flatten: true },
    { dest: "", filenames: ["sksevr_1*.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["sksevr_loader.exe"], flatten: true, looseOnly: true },
    { dest: "", folders: ["enbseries"], flatten: true },
    {
      dest: `drive_c/users/steamuser/Documents/My Games/${SKYRIM_VR_CONSTANTS.myGamesSubpath}/Saves`,
      extensions: SKYRIM_VR_CONSTANTS.saveExtension,
      flatten: true,
      toPrefix: true,
    },
  ];
}
