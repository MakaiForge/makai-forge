import { applyWineDllOverrides } from "../_shared/prefix";
import { WITCHER3_DLL_OVERRIDES } from "./witcher3.constants";

export function getDllOverrides(): Record<string, string> {
  return { ...WITCHER3_DLL_OVERRIDES };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, getDllOverrides());
}
