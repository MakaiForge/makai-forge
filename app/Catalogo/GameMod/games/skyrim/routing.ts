import type { CustomRule } from "../_shared/types";
import { SKYRIM_CONSTANTS } from "./skyrim.constants";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  const rules: CustomRule[] = [
    { dest: "", filenames: ["d3dx9_42.dll"], flatten: true },
    { dest: "", filenames: ["skse_1*.dll"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["skse_loader.exe"], flatten: true, looseOnly: true },
    { dest: "", filenames: ["d3dcompiler_47.dll"], flatten: true, looseOnly: true },
    {
      dest: "",
      filenames: [
        "d3d11.dll", "d3dcompiler_46e.dll",
        "enbadaptation.fx", "enbbloom.fx", "enbdepthoffield.fx",
        "enbeffect.fx", "enbeffectpostpass.fx", "enbeffectprepass.fx",
        "enblens.fx", "enblocal.ini", "enbpalette.bmp",
        "enbraindrops.dds", "enbseries.ini", "enbsunsprite.bmp",
        "enbsunsprite.fx", "enbunderwater.fx", "enbunderwaternoise.bmp",
      ],
      flatten: true,
    },
    { dest: "", folders: ["enbseries"], flatten: true },
    {
      dest: `drive_c/users/steamuser/Documents/My Games/${SKYRIM_CONSTANTS.myGamesSubpath}/Saves`,
      extensions: SKYRIM_CONSTANTS.saveExtension,
      flatten: true,
      toPrefix: true,
    },
  ];

  return rules;
}
