import fs from "node:fs"
import path from "node:path"

const INSTALLER_PATTERNS = [/setup/i, /install/i, /msi/i]
const SCAN_MAX_DEPTH = 2

function findInstallerInFolder(folderPath: string): string | null {
  const abs = path.resolve(folderPath)

  function walk(dir: string, depth: number): string | null {
    if (depth > SCAN_MAX_DEPTH) return null
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const found = walk(full, depth + 1)
          if (found) return found
        } else if (
          entry.isFile() &&
          entry.name.toLowerCase().endsWith(".exe") &&
          INSTALLER_PATTERNS.some((p) => p.test(entry.name))
        ) {
          return full
        }
      }
    } catch {
      // skip unreadable dirs
    }
    return null
  }

  return walk(abs, 0)
}

function walkDir(dirPath: string): string[] {
  const files: string[] = []
  const seen = new Set<string>()

  function walk(d: string) {
    const real = fs.realpathSync(d)
    if (seen.has(real)) return
    seen.add(real)
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(d, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.isFile()) {
          files.push(full)
        }
      }
    } catch {
      // skip
    }
  }

  walk(dirPath)
  return files
}

export function detectInstallerType(sourcePath: string): {
  is_installer: boolean
  installer_path: string | null
  source_path: string
  error: string | null
  exe_count: number
  total_files: number
} {
  const abs = path.resolve(sourcePath)

  if (!fs.existsSync(abs)) {
    return {
      is_installer: false,
      installer_path: null,
      source_path: abs,
      error: "source_path does not exist",
      exe_count: 0,
      total_files: 0,
    }
  }

  // Single file
  if (fs.statSync(abs).isFile()) {
    const ext = path.extname(abs).toLowerCase()
    if (ext === ".exe" || ext === ".msi") {
      return {
        is_installer: true,
        installer_path: abs,
        source_path: abs,
        exe_count: 0,
        total_files: 0,
      }
    }
    return {
      is_installer: false,
      installer_path: null,
      source_path: abs,
      exe_count: 0,
      total_files: 0,
    }
  }

  // Folder — search for installer-named exe
  const installer = findInstallerInFolder(abs)
  if (installer) {
    return {
      is_installer: true,
      installer_path: installer,
      source_path: abs,
      exe_count: 0,
      total_files: 0,
    }
  }

  // Portable — collect stats
  const allFiles = walkDir(abs)
  const exeCount = allFiles.filter((f) => f.toLowerCase().endsWith(".exe")).length

  return {
    is_installer: false,
    installer_path: null,
    source_path: abs,
    error: null,
    exe_count: exeCount,
    total_files: allFiles.length,
  }
}
