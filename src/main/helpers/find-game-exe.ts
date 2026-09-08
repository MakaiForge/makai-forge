import fs from "node:fs";
import path from "node:path";

const SYSTEM_DIRS = new Set([
  "windows", "system32", "syswow64", "system", "winsxs",
  "temp", "tmp", "msdownld.tmp", "cache", "logs",
  "perflogs", "recovery", "boot",
]);

const NEGATIVE_DIRS = new Set([
  "common files",
  "internet explorer",
  "windows media player",
  "windows nt",
  "msbuild",
  "reference assemblies",
  "microsoft sdks",
  "microsoft.net",
  "windows kits",
  "microsoft sql server",
]);

const EXCLUDED_EXES = new Set([
  "uninstall.exe", "uninst.exe", "uninst000.exe", "unins000.exe",
  "vc_redist.exe", "vcredist.exe", "vcredist_x86.exe", "vcredist_x64.exe",
  "dotnet.exe", "dotnetfx.exe",
  "dxsetup.exe", "directx.exe", "dxwebsetup.exe",
]);

const EXCLUDED_PATTERNS = [
  /^vc_redist/i, /^vcredist/i, /^dotnet/i, /^dxsetup/i,
  /^unins/i, /^uninst/i,
  /redist/i,
];

const MAX_RESULTS = 5;

export interface ScanResult {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
}

export function findGameExecutables(prefixPath: string): {
  candidates: ScanResult[];
  suggestedDir: string | null;
} {
  const driveC = path.join(prefixPath, "drive_c");
  if (!fs.existsSync(driveC)) {
    return { candidates: [], suggestedDir: null };
  }

  const results: ScanResult[] = [];

  function scan(dir: string, depth: number = 0) {
    if (depth > 6) return;
    const baseName = path.basename(dir).toLowerCase();
    if (SYSTEM_DIRS.has(baseName)) return;
    if (NEGATIVE_DIRS.has(baseName)) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
          try {
            if (EXCLUDED_EXES.has(entry.name.toLowerCase())) continue;
            if (EXCLUDED_PATTERNS.some((p) => p.test(entry.name))) continue;
            const stat = fs.statSync(fullPath);
            if (stat.size > 1024) {
              results.push({
                path: fullPath,
                name: entry.name,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
              });
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  scan(driveC);

  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const candidates = results.slice(0, MAX_RESULTS);

  const suggestedDir = candidates.length > 0
    ? path.dirname(candidates[0].path)
    : null;

  return { candidates, suggestedDir };
}
