import { applyWineDllOverrides } from "../_shared/prefix";
import { STARFIELD_DLL_OVERRIDES } from "./starfield.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...STARFIELD_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, STARFIELD_DLL_OVERRIDES);
}
