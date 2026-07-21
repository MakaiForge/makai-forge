import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ProgressCallback } from "./downloader";

const execAsync = promisify(exec);

export type ArchiveType = "zip" | "7z" | null;

export function detectArchiveMagic(filePath: string): ArchiveType {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(6);
    fs.readSync(fd, buf, 0, 6, 0);
    fs.closeSync(fd);

    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
    if (buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf && buf[4] === 0x27 && buf[5] === 0x1c) return "7z";
    return null;
  } catch {
    return null;
  }
}

export async function extractArchive(
  archivePath: string,
  destDir: string,
  type: ArchiveType
): Promise<void> {
  if (!type) return;

  const extractDir = path.join(destDir, "_extracted");
  fs.mkdirSync(extractDir, { recursive: true });

  await execAsync(`7z x "${archivePath}" -o"${extractDir}" -y`, { timeout: 120000 });

  const contentDir = findContentRoot(extractDir);
  if (contentDir) {
    copyContent(contentDir, destDir);
  }

  await execAsync(`rm -rf "${extractDir}"`).catch(() => {});
}

function findContentRoot(dirPath: string): string | null {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory());
    const files = entries.filter((e) => e.isFile());
    if (subdirs.length === 1 && files.length === 0) {
      return path.join(dirPath, subdirs[0].name);
    }
    return dirPath;
  } catch {
    return null;
  }
}

function copyContent(srcDir: string, destDir: string): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const srcPath = path.join(srcDir, e.name);
    const dstPath = path.join(destDir, e.name);
    if (e.isDirectory()) {
      fs.cpSync(srcPath, dstPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
