import path from "node:path";
import fs from "node:fs";
import { ModStorageService } from "@mods/services/mod-storage-service";
import { expandHome } from "@mods/services/path-utils";
import { getStagingDir } from "./filemap";

const KNOWN_GAME_DIRS = new Set(["data"]);

function moveContents(srcDir: string, destDir: string): void {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    try { fs.renameSync(srcPath, destPath); } catch {
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        moveContents(srcPath, destPath);
        fs.rmSync(srcPath, { recursive: true, force: true });
      } else {
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      }
    }
  }
}

function stripKnownGameDir(tmpDir: string, stagingDir: string): boolean {
  // Look for known game directories (Data/, skse/, enbseries/) at root of tmpDir
  // and strip them (move contents directly to stagingDir).
  // Returns true if any directory was stripped.
  const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
  let stripped = false;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (KNOWN_GAME_DIRS.has(entry.name.toLowerCase())) {
      const dirPath = path.join(tmpDir, entry.name);
      moveContents(dirPath, stagingDir);
      fs.rmSync(dirPath, { recursive: true, force: true });
      stripped = true;
    }
  }
  return stripped;
}

export async function extractArchive(
  archivePath: string,
  gameId: string,
  modName: string,
  password?: string,
): Promise<string> {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const baseDir = config?.stagingDir ? expandHome(config.stagingDir) : getStagingDir(gameId);
  const stagingDir = path.join(baseDir, modName);

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  const stat = fs.statSync(archivePath);
  if (stat.size === 0) {
    throw new Error(`Archive is empty: ${archivePath}`);
  }

  const { default: Seven } = await import("node-7z");

  try {
    await new Promise<void>((resolve, reject) => {
      const listStream = Seven.list(archivePath, { recursive: true });
      listStream.on("end", () => resolve());
      listStream.on("error", (err: any) => reject(err));
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/wrong password|encrypted/i.test(msg)) {
      throw new Error("Archive is password-protected");
    }
    throw new Error(`Archive is corrupted or invalid: ${msg}`);
  }

  // Extract to temp dir (Amethyst-style) to detect and strip Data/ top-level folder
  const tmpDir = path.join(stagingDir, ".tmpinstall");
  fs.mkdirSync(tmpDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Extraction timed out after 5 minutes"));
    }, 300_000);

    const options: Record<string, unknown> = { recursive: true };
    if (password) options.p = password;

    const stream = Seven.extractFull(archivePath, tmpDir, options);
    stream.on("end", () => {
      clearTimeout(timeout);
      resolve();
    });
    stream.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // 1) Strip single top-level directory (mod name folder wrapper)
  const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
  const subdirs = entries.filter(e => e.isDirectory());
  const rootFiles = entries.filter(e => e.isFile());

  if (subdirs.length === 1 && rootFiles.length === 0) {
    const topDir = path.join(tmpDir, subdirs[0].name);
    const inner = fs.readdirSync(topDir, { withFileTypes: true });
    for (const entry of inner) {
      const srcPath = path.join(topDir, entry.name);
      const destPath = path.join(tmpDir, entry.name);
      try { fs.renameSync(srcPath, destPath); } catch { /* cross-device */ }
    }
    fs.rmSync(topDir, { recursive: true, force: true });
  }

  // 2) Strip known game directories (Data/, skse/, enbseries/) from the result
  stripKnownGameDir(tmpDir, stagingDir);

  // 3) Move remaining contents (root files + non-game dirs) to staging
  const remaining = fs.readdirSync(tmpDir, { withFileTypes: true });
  for (const entry of remaining) {
    const srcPath = path.join(tmpDir, entry.name);
    const destPath = path.join(stagingDir, entry.name);
    try { fs.renameSync(srcPath, destPath); } catch {
      if (entry.isDirectory()) {
        moveContents(srcPath, destPath);
        fs.rmSync(srcPath, { recursive: true, force: true });
      } else {
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      }
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return stagingDir;
}
