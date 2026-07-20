import { applyWineDllOverrides } from "../_shared/prefix";
import { SKYRIM_SE_DLL_OVERRIDES } from "./skyrim-se.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...SKYRIM_SE_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, SKYRIM_SE_DLL_OVERRIDES);
}
