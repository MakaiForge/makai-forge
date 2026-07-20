import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__"])

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx
  return prefixPath
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
          if (!SKIP_DIRS.has(entry.name)) walk(full)
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

async function fileSha256(filePath: string): Promise<string | null> {
  try {
    const hash = crypto.createHash("sha256")
    const handle = await fs.promises.open(filePath, "r")
    const buffer = Buffer.alloc(65536)
    try {
      let bytesRead: number
      while ((bytesRead = (await handle.read(buffer, 0, 65536, null)).bytesRead) > 0) {
        hash.update(buffer.subarray(0, bytesRead))
      }
    } finally {
      await handle.close()
    }
    return hash.digest("hex")
  } catch {
    return null
  }
}

async function computeHashes(
  files: string[],
  basePath: string,
  progressCallback?: (percent: number) => void,
  pbase = 0,
  prange = 100
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}
  const batchSize = 20
  const total = files.length

  for (let i = 0; i < total; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (fp) => {
        const rel = path.relative(basePath, fp)
        const h = await fileSha256(fp)
        return { rel, hash: h }
      })
    )
    for (const { rel, hash } of results) {
      if (hash) hashes[rel] = hash
    }
    if (progressCallback && total > 0) {
      progressCallback(pbase + Math.round(((i + batchSize) / total) * prange))
    }
  }

  return hashes
}

function totalBytes(files: string[]): number {
  let total = 0
  for (const f of files) {
    try {
      total += fs.statSync(f).size
    } catch {
      // skip
    }
  }
  return total
}

export async function copyToPrefix(
  sourcePath: string,
  prefixPath: string,
  progressCallback?: (percent: number) => void
): Promise<{
  success: boolean
  dest_path: string | null
  files_count: number
  error?: string
  hashes_ok?: boolean
  mismatches?: string[]
}> {
  const absSource = path.resolve(sourcePath)
  const absPrefix = path.resolve(prefixPath)
  const actual = resolveActualPrefix(absPrefix)
  const driveC = path.join(actual, "drive_c")
  const folderName = path.basename(absSource)
  const destPath = path.join(driveC, folderName)

  if (!fs.statSync(absSource, { throwIfNoEntry: false })?.isDirectory()) {
    return {
      success: false,
      error: "source_path is not a directory",
      dest_path: null,
      files_count: 0,
    }
  }

  // Remove existing dest
  if (fs.existsSync(destPath)) {
    fs.rmSync(destPath, { recursive: true, force: true })
  }

  // List files
  const allFiles = walkDir(absSource)
  const total = allFiles.length

  if (total === 0) {
    fs.mkdirSync(destPath, { recursive: true })
    return { success: true, dest_path: destPath, files_count: 0, hashes_ok: true }
  }

  if (total > 50000) {
    return {
      success: false,
      error: `Pasta com ${total} arquivos parece não ser um jogo`,
      dest_path: null,
      files_count: total,
    }
  }

  // Total bytes for realistic progress
  const bytesTotal = totalBytes(allFiles)
  const progressDenom = bytesTotal > 0 ? bytesTotal : total

  // Phase 1: SHA256 pre-copy (0-5%)
  progressCallback?.(0)
  const sourceHashes = await computeHashes(allFiles, absSource, progressCallback, 0, 5)

  // Phase 2: Copy in batches with byte-based progress (5-90%)
  const batchSize = 50
  let copiedBytes = 0

  for (let i = 0; i < total; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize)
    const tasks = batch.map(async (srcFile) => {
      const rel = path.relative(absSource, srcFile)
      const destFile = path.join(destPath, rel)
      await fs.promises.mkdir(path.dirname(destFile), { recursive: true })
      try {
        await fs.promises.copyFile(srcFile, destFile)
        try {
          copiedBytes += fs.statSync(srcFile).size
        } catch {
          copiedBytes += 1
        }
      } catch {
        // skip unreadable files
      }
    })
    await Promise.all(tasks)

    if (progressCallback && progressDenom > 0) {
      const pct = 5 + Math.round((copiedBytes / progressDenom) * 85)
      progressCallback(Math.min(90, pct))
    }
  }

  // Verify count
  const destFiles = walkDir(destPath)
  if (destFiles.length !== total) {
    return {
      success: false,
      error: `Count mismatch: source ${total}, dest ${destFiles.length}`,
      dest_path: destPath,
      files_count: total,
    }
  }

  // Phase 3: SHA256 post-copy + comparison (90-100%)
  progressCallback?.(90)
  const destHashes = await computeHashes(destFiles, destPath, progressCallback, 90, 10)

  const mismatches: string[] = []
  for (const [rel, expected] of Object.entries(sourceHashes)) {
    const actual = destHashes[rel]
    if (!actual) {
      mismatches.push(`${rel}: missing in dest`)
    } else if (actual !== expected) {
      mismatches.push(`${rel}: hash mismatch`)
    }
  }

  const hashesOk = mismatches.length === 0
  progressCallback?.(100)

  return {
    success: hashesOk,
    dest_path: destPath,
    files_count: total,
    hashes_ok: hashesOk,
    mismatches: mismatches.slice(0, 10),
  }
}
