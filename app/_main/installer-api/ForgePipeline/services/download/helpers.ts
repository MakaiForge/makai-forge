import fs from "node:fs/promises";
import path from "node:path";

export function calculateETA(
  fileSize: number,
  bytesDownloaded: number,
  downloadSpeed: number
): number {
  if (downloadSpeed <= 0) return -1;
  const remainingBytes = fileSize - bytesDownloaded;
  if (remainingBytes <= 0) return 0;
  return Math.ceil(remainingBytes / downloadSpeed);
}

export async function getDirSize(dirPath: string): Promise<number> {
  let totalSize = 0;

  async function walk(currentPath: string): Promise<void> {
    try {
      const stats = await fs.stat(currentPath);
      if (stats.isFile()) {
        totalSize += stats.size;
      } else if (stats.isDirectory()) {
        const entries = await fs.readdir(currentPath);
        await Promise.all(
          entries.map((entry) => walk(path.join(currentPath, entry)))
        );
      }
    } catch {
      // Ignore permission errors
    }
  }

  await walk(dirPath);
  return totalSize;
}
