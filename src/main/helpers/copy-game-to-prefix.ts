import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function copyGameToPrefix(
  gamePath: string,
  prefixPath: string
): string {
  const folderName = path.basename(gamePath);
  const destPath = path.join(prefixPath, "drive_c", folderName);

  if (fs.existsSync(destPath)) {
    fs.rmSync(destPath, { recursive: true, force: true });
  }

  fs.cpSync(gamePath, destPath, { recursive: true });
  return destPath;
}

export function computeFilesHash(
  folderPath: string
): Record<string, string> {
  const hashes: Record<string, string> = {};

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const hash = crypto.createHash("sha256");
          const buffer = fs.readFileSync(fullPath);
          hash.update(buffer);
          hashes[fullPath] = hash.digest("hex");
        }
      }
    } catch {
      // skip
    }
  }

  walk(folderPath);
  return hashes;
}

export function verifyHashes(
  original: Record<string, string>,
  copied: Record<string, string>
): boolean {
  const originalKeys = Object.keys(original).sort();
  const copiedKeys = Object.keys(copied).sort();

  if (originalKeys.length !== copiedKeys.length) return false;

  for (let i = 0; i < originalKeys.length; i++) {
    if (original[originalKeys[i]] !== copied[copiedKeys[i]]) return false;
  }

  return true;
}
