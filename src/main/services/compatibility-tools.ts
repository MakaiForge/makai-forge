import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { SystemPath } from "./system-path";

export interface CompatibilityTool {
  name: string;
  internalTitle: string;
  path: string;
  source: "steam" | "compatibilitytools" | "protonforge" | "system";
}

const isValidProtonDir = (dir: string): boolean =>
  fs.existsSync(path.join(dir, "proton")) &&
  fs.existsSync(path.join(dir, "toolmanifest.vdf"));

function readCompatibilityToolVdf(toolDir: string): string | null {
  const vdfPath = path.join(toolDir, "compatibilitytool.vdf");
  if (!fs.existsSync(vdfPath)) return null;
  try {
    const raw = fs.readFileSync(vdfPath, "utf-8");
    const match = raw.match(/"([^"]+)"\s*\n\s*\{[^}]*"display_name"\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    return null;
  }
  return null;
}

function scanDir(dir: string, source: CompatibilityTool["source"]): CompatibilityTool[] {
  if (!fs.existsSync(dir)) return [];
  const results: CompatibilityTool[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      if (!isValidProtonDir(fullPath)) continue;
      const realPath = fs.realpathSync(fullPath);
      const internalTitle = readCompatibilityToolVdf(realPath) || path.basename(realPath);
      results.push({
        name: path.basename(realPath),
        internalTitle,
        path: realPath,
        source,
      });
    }
  } catch {
    /* skip unreadable */
  }
  return results;
}

function dedupe(tools: CompatibilityTool[]): CompatibilityTool[] {
  const seen = new Set<string>();
  return tools.filter((t) => {
    if (seen.has(t.path)) return false;
    seen.add(t.path);
    return true;
  });
}

export function getCompatibilityTools(): CompatibilityTool[] {
  const home = SystemPath.getPath("home");

  const steamCommon = path.join(home, ".steam", "steam", "steamapps", "common");
  const steamCompat = path.join(home, ".steam", "steam", "compatibilitytools.d");
  const systemCompat = "/usr/share/steam/compatibilitytools.d";
  const appCompat = path.join(app.getPath("userData"), "compat-tools", "compatibilitytools.d");
  const legacyCompat = path.join(home, ".config", "protonforge", "compat-tools", "compatibilitytools.d");

  const tools: CompatibilityTool[] = [];

  if (fs.existsSync(steamCommon)) {
    try {
      const entries = fs.readdirSync(steamCommon, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith("Proton")) continue;
        const fullPath = path.join(steamCommon, entry.name);
        if (!isValidProtonDir(fullPath)) continue;
        const realPath = fs.realpathSync(fullPath);
        tools.push({
          name: path.basename(realPath),
          internalTitle: path.basename(realPath),
          path: realPath,
          source: "steam",
        });
      }
    } catch {
      /* skip */
    }
  }

  tools.push(...scanDir(steamCompat, "compatibilitytools"));
  tools.push(...scanDir(systemCompat, "system"));
  tools.push(...scanDir(appCompat, "protonforge"));
  tools.push(...scanDir(legacyCompat, "protonforge"));

  return dedupe(tools).sort((a, b) => a.name.localeCompare(b.name));
}
