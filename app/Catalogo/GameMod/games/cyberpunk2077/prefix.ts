import { applyWineDllOverrides } from "../_shared/prefix";
import { CYBERPUNK_DLL_OVERRIDES } from "./cyberpunk2077.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...CYBERPUNK_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, getDllOverrides());
}
