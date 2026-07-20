import { applyWineDllOverrides } from "../_shared/prefix";
import { FO3_DLL_OVERRIDES } from "./fallout3.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...FO3_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, FO3_DLL_OVERRIDES);
}
