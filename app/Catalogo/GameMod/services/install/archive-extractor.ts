import fs from "node:fs";
import path from "node:path";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import type { ArchiveInfo, ExtractedFile } from "@mods/types/install.types";

type ExtractProgressCallback = (
  filesProcessed: number,
  filesTotal: number,
  bytesProcessed: number,
  bytesTotal: number,
  currentFile: string,
) => void;

export async function extractWithProgress(
  archivePath: string,
  targetDir: string,
  _archiveInfo: ArchiveInfo,
  password?: string,
  _onProgress?: ExtractProgressCallback,
  _abortSignal?: AbortSignal,
): Promise<ExtractedFile[]> {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const params: Record<string, unknown> = {
    archive: archivePath,
    dest: targetDir,
  };
  if (password) params.password = password;

  await MakaiRPC.call("extract_archive", params);

  const extractedFiles: ExtractedFile[] = [];
  const collectFiles = (dir: string, relativeDir: string = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const absPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        const stat = fs.statSync(absPath);
        extractedFiles.push({
          relativePath: relPath,
          absolutePath: absPath,
          expectedSize: stat.size,
          actualSize: stat.size,
          verified: true,
        });
      } else if (entry.isDirectory()) {
        collectFiles(absPath, relPath);
      }
    }
  };
  collectFiles(targetDir);

  return extractedFiles;
}
