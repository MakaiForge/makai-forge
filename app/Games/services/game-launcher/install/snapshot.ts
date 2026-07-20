import fs from "node:fs"
import path from "node:path"

export interface SnapshotEntry {
  path: string
  size: number
  mtimeMs: number
  isDirectory: boolean
}

const WINE_INTERNAL_DIR_PREFIXES = [
  "windows/",
  "windows/system32/",
  "windows/syswow64/",
  "windows/system/",
  "windows/winsxs/",
  "windows/installer/",
  "windows/temp/",
  "windows/msdownld.tmp/",
  "ProgramData/",
  "Config.Msi/",
  "$Recycle.Bin/",
]

function isWineInternal(relPath: string): boolean {
  const lower = relPath.toLowerCase()
  return WINE_INTERNAL_DIR_PREFIXES.some((p) => lower.startsWith(p))
}

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx
  return prefixPath
}

export function snapshotPrefix(prefixPath: string): SnapshotEntry[] {
  const absPrefix = path.resolve(prefixPath)
  const actual = resolveActualPrefix(absPrefix)
  const driveC = path.join(actual, "drive_c")
  const entries: SnapshotEntry[] = []

  function walk(dir: string, relPrefix: string) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        const full = path.join(dir, item.name)
        const rel = relPrefix ? `${relPrefix}/${item.name}` : item.name

        if (item.isDirectory()) {
          try {
            const stat = fs.statSync(full)
            entries.push({
              path: rel,
              size: 0,
              mtimeMs: stat.mtimeMs,
              isDirectory: true,
            })
          } catch {
            // skip
          }
          walk(full, rel)
        } else if (item.isFile()) {
          try {
            const stat = fs.statSync(full)
            entries.push({
              path: rel,
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              isDirectory: false,
            })
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip
    }
  }

  if (fs.existsSync(driveC)) {
    walk(driveC, "")
  }

  return entries
}

export function findNewExecutables(
  before: SnapshotEntry[],
  after: SnapshotEntry[]
): SnapshotEntry[] {
  const beforePaths = new Set(before.map((e) => e.path))
  const beforeDirs = new Set(
    before.filter((e) => e.isDirectory).map((e) => e.path)
  )

  const afterSorted = [...after].sort((a, b) => b.mtimeMs - a.mtimeMs)

  const newInNewDirs: SnapshotEntry[] = []
  const newInExistingDirs: SnapshotEntry[] = []
  const seen = new Set<string>()

  for (const entry of afterSorted) {
    if (entry.isDirectory) continue
    const p = entry.path
    if (!p.toLowerCase().endsWith(".exe")) continue
    if (isWineInternal(p)) continue
    if (beforePaths.has(p)) continue
    if (seen.has(p)) continue
    seen.add(p)

    const parentDir = p.includes("/") ? p.substring(0, p.lastIndexOf("/")) : ""
    const parentIsNew = parentDir !== "" && !beforeDirs.has(parentDir)

    if (parentIsNew) {
      newInNewDirs.push(entry)
    } else {
      newInExistingDirs.push(entry)
    }
  }

  return [...newInNewDirs, ...newInExistingDirs]
}
