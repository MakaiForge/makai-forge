import fs from "node:fs"
import path from "node:path"
import type { InstallCandidate } from "./types"

const SYSTEM_DIRS = new Set([
  "windows", "system32", "syswow64", "system", "winsxs",
  "temp", "tmp", "msdownld.tmp", "cache", "logs",
  "perflogs", "recovery", "boot",
])

const NEGATIVE_DIRS = new Set([
  "common files", "internet explorer", "windows media player",
  "windows nt", "msbuild", "reference assemblies",
  "microsoft sdks", "microsoft.net", "windows kits",
  "microsoft sql server",
])

const EXCLUDED_EXES = new Set([
  "uninstall.exe", "uninst.exe", "uninst000.exe", "unins000.exe",
  "vc_redist.exe", "vcredist.exe", "vcredist_x86.exe", "vcredist_x64.exe",
  "dotnet.exe", "dotnetfx.exe", "dxsetup.exe", "directx.exe", "dxwebsetup.exe",
])

const EXCLUDED_PATTERNS = [
  /^vc_redist/i, /^vcredist/i, /^dotnet/i, /^dxsetup/i,
  /^unins/i, /^uninst/i, /redist/i,
]

const GAME_EXE_PATTERNS = [
  /^game\.exe$/i,
  /.+-win64-shipping\.exe$/i,
  /.+-win32-shipping\.exe$/i,
  /.+_windows\.exe$/i,
  /^nw\.exe$/i,
]

const LAUNCHER_PATTERNS = [
  /^launcher\.exe$/i,
  /^start(?:er|_game|_app|\.exe)?$/i,
  /^patcher\.exe$/i,
  /^updater\.exe$/i,
  /^makai_time\.exe$/i,
]

const SETUP_PATTERNS = [
  /^setup/i, /^install/i, /^autorun/i,
]

const MAX_CANDIDATES = 10

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx
  return prefixPath
}

function classifyExe(name: string): string {
  const lower = name.toLowerCase()

  if (SETUP_PATTERNS.some((p) => p.test(name))) return "setup"
  if (EXCLUDED_EXES.has(lower)) return "redist"
  if (EXCLUDED_PATTERNS.some((p) => p.test(name))) return "redist"
  if (LAUNCHER_PATTERNS.some((p) => p.test(name))) return "launcher"
  if (GAME_EXE_PATTERNS.some((p) => p.test(name))) return "game"

  return "unknown"
}

export function scanPrefixForExes(
  prefixPath: string,
  gameFolderName?: string
): {
  candidates: InstallCandidate[]
  suggested_dir: string | null
} {
  const absPrefix = path.resolve(prefixPath)
  const actual = resolveActualPrefix(absPrefix)
  const driveC = path.join(actual, "drive_c")

  if (!fs.existsSync(driveC)) {
    return { candidates: [], suggested_dir: null }
  }

  const results: InstallCandidate[] = []

  function scan(dir: string, depth = 0) {
    if (depth > 6) return
    const base = path.basename(dir).toLowerCase()
    if (SYSTEM_DIRS.has(base) || NEGATIVE_DIRS.has(base)) return

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scan(full, depth + 1)
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
          const lower = entry.name.toLowerCase()
          if (EXCLUDED_EXES.has(lower)) continue
          if (EXCLUDED_PATTERNS.some((p) => p.test(entry.name))) continue

          try {
            const stat = fs.statSync(full)
            if (stat.size > 1024) {
              let type = classifyExe(entry.name)
              if (
                type === "unknown" &&
                gameFolderName &&
                path.parse(entry.name).name.toLowerCase() ===
                  path.parse(gameFolderName).name.toLowerCase()
              ) {
                type = "game"
              }
              results.push({
                path: full,
                name: entry.name,
                size: stat.size,
                type,
              })
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip
    }
  }

  scan(driveC)

  results.sort((a, b) => b.size - a.size)
  const candidates = results.slice(0, MAX_CANDIDATES)
  const suggestedDir = candidates.length > 0 ? path.dirname(candidates[0].path) : driveC

  return { candidates, suggested_dir: suggestedDir }
}
