import { applyWineDllOverrides } from "../_shared/prefix";
import { MORROWIND_DLL_OVERRIDES } from "./morrowind.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...MORROWIND_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, MORROWIND_DLL_OVERRIDES);
}
