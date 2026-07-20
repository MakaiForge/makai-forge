import { applyWineDllOverrides } from "../_shared/prefix";

export function getDllOverrides(): Record<string, string> {
  return { "winmm": "native,builtin", "version": "native,builtin" };
}

export function applyOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, getDllOverrides());
}
