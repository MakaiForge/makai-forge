import { applyWineDllOverrides } from "../_shared/prefix";
import { FNV_DLL_OVERRIDES } from "./falloutnv.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...FNV_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, FNV_DLL_OVERRIDES);
}
