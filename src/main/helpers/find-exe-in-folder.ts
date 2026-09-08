import fs from "node:fs";
import path from "node:path";

const MAX_RESULTS = 5;

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

export interface ScanResult {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
}

export function findExesInFolder(folderPath: string): {
  candidates: ScanResult[];
  suggestedDir: string | null;
} {
  if (!fs.existsSync(folderPath)) {
    return { candidates: [], suggestedDir: null };
  }

  const results: ScanResult[] = [];

  function scan(dir: string, depth: number = 0) {
    if (depth > 3) return;

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

  scan(folderPath);

  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const candidates = results.slice(0, MAX_RESULTS);

  const suggestedDir = candidates.length > 0
    ? path.dirname(candidates[0].path)
    : folderPath;

  return { candidates, suggestedDir };
}
