import { applyWineDllOverrides } from "../_shared/prefix";
import { OBLIVION_DLL_OVERRIDES } from "./oblivion.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...OBLIVION_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, OBLIVION_DLL_OVERRIDES);
}
