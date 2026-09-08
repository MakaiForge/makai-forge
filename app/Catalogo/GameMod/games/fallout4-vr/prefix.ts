import { applyWineDllOverrides } from "../_shared/prefix";
import { FO4_VR_DLL_OVERRIDES } from "./fallout4-vr.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...FO4_VR_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, FO4_VR_DLL_OVERRIDES);
}
