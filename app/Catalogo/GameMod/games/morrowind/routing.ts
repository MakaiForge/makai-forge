import type { CustomRule } from "../_shared/types";
import { MORROWIND_CONSTANTS } from "./morrowind.constants";

export function getCustomRoutingRules(_prefixPath?: string): CustomRule[] {
  return [
    { dest: "", filenames: ["d3dcompiler_47.dll"], flatten: true, looseOnly: true },
    { dest: `drive_c/users/steamuser/Documents/My Games/${MORROWIND_CONSTANTS.myGamesSubpath}/Saves`, extensions: MORROWIND_CONSTANTS.saveExtension, flatten: true, toPrefix: true },
  ];
}
