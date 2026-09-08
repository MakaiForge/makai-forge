import { applyWineDllOverrides } from "../_shared/prefix";
import { SKYRIM_VR_DLL_OVERRIDES } from "./skyrim-vr.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...SKYRIM_VR_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, SKYRIM_VR_DLL_OVERRIDES);
}
