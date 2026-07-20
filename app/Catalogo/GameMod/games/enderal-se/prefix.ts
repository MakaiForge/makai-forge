import { applyWineDllOverrides } from "../_shared/prefix";
import { ENDERAL_SE_DLL_OVERRIDES } from "./enderal-se.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...ENDERAL_SE_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, ENDERAL_SE_DLL_OVERRIDES);
}
