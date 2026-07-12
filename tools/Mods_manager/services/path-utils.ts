import os from "node:os";
import path from "node:path";

/**
 * Expand `~` at the start of a path to the user's home directory.
 * Also resolves relative paths to absolute.
 */
export function expandHome(p: string): string {
  if (!p || typeof p !== "string") return p;
  let result = p;
  if (result.startsWith("~")) {
    result = result.replace("~", os.homedir());
  }
  // Ensure absolute — if still relative, resolve against home
  if (!path.isAbsolute(result)) {
    result = path.resolve(os.homedir(), result);
  }
  return result;
}
