import fs from "node:fs";
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

export function getDirSize(dirPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let totalSize = 0;

    function calculateSize(currentPath: string) {
      try {
        const stats = fs.statSync(currentPath);
        if (stats.isFile()) {
          totalSize += stats.size;
        } else if (stats.isDirectory()) {
          const files = fs.readdirSync(currentPath);
          files.forEach((file) => calculateSize(path.join(currentPath, file)));
        }
      } catch (err) {
        // Ignore permission errors
      }
    }

    try {
      calculateSize(dirPath);
      resolve(totalSize);
    } catch (err) {
      reject(err);
    }
  });
}
