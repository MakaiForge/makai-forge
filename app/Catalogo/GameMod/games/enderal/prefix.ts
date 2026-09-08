import { applyWineDllOverrides } from "../_shared/prefix";
import { ENDERAL_DLL_OVERRIDES } from "./enderal.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...ENDERAL_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, ENDERAL_DLL_OVERRIDES);
}
