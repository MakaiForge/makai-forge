import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import { ModStorageService } from "@mods/services/mod-storage-service";
import { get7zPath } from "../../play/sevenz";
import { getStagingDir } from "../_shared/filemap";
import { SKYRIM_MOD_REQUIRED_FOLDERS } from "./skyrim.constants";

const KNOWN_GAME_DIRS = SKYRIM_MOD_REQUIRED_FOLDERS;
const MAX_WRAPPER_LEVELS = 50;

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

function stripWrappers(stagingDir: string): void {
  let wrapperLevel = 0;
  while (wrapperLevel < MAX_WRAPPER_LEVELS) {
    const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
    const subdirs = entries.filter(e => e.isDirectory() && e.name.toLowerCase() !== "fomod");
    const rootFiles = entries.filter(e => e.isFile());
    if (subdirs.length !== 1 || rootFiles.length !== 0) break;
    if (KNOWN_GAME_DIRS.has(subdirs[0].name.toLowerCase())) break;

    const topDir = path.join(stagingDir, subdirs[0].name);
    const inner = fs.readdirSync(topDir, { withFileTypes: true });
    for (const entry of inner) {
      const srcPath = path.join(topDir, entry.name);
      const destPath = path.join(stagingDir, entry.name);
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
    fs.rmSync(topDir, { recursive: true, force: true });
    wrapperLevel++;
  }
}

function getStagingPath(archivePath: string, gameId: string, modName: string): string {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const baseDir = config?.stagingDir || getStagingDir(gameId);
  return path.join(baseDir, modName);
}

function prepareStagingDir(stagingDir: string): void {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });
}

function finalizeExtraction(stagingDir: string): string {
  stripWrappers(stagingDir);
  stripKnownGameDir(stagingDir, stagingDir);
  return stagingDir;
}

// ─── .zip extraction via JSZip (pure JS, no external binary) ───

async function extractZip(
  archivePath: string,
  stagingDir: string,
  onProgress?: (stage: string, percent: number, message: string) => void,
): Promise<void> {
  const buffer = await fs.promises.readFile(archivePath);
  const zip = await JSZip.loadAsync(buffer);

  const entries = Object.values(zip.files).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  let done = 0;
  const total = entries.length;

  for (const entry of entries) {
    const destPath = path.join(stagingDir, entry.name);

    if (entry.dir) {
      fs.mkdirSync(destPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const data = await entry.async("nodebuffer");
      fs.writeFileSync(destPath, data);
    }

    done++;
    onProgress?.("extracting", Math.round((done / total) * 100), `Extraindo... (${done}/${total})`);
  }
}

// ─── .7z / .rar extraction via 7z binary ───

async function extract7z(
  archivePath: string,
  stagingDir: string,
  password: string | undefined,
  onProgress?: (stage: string, percent: number, message: string) => void,
): Promise<void> {
  const args = ["x", archivePath, `-o${stagingDir}`, "-y", "-bsp1"];
  if (password) args.push(`-p${password}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(get7zPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* dead already */ }
      }, 2000);
      reject(new Error("Extraction timed out after 2 minutes"));
    }, 120_000);

    let stderrBuf = "";

    child.stdout?.on("data", (data: Buffer) => {
      const m = data.toString().match(/(\d+)%/);
      if (m) onProgress?.("extracting", parseInt(m[1]), `Extraindo... (${m[1]}%)`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderrBuf += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) return;

      if (code === 0) {
        resolve();
      } else {
        const stderr = stderrBuf.trim();
        const isPassword = /wrong password|encrypted|can not open/i.test(stderr);
        reject(new Error(isPassword
          ? "Archive is password-protected"
          : `7z exited with code ${code}${stderr ? `: ${stderr}` : ""}`,
        ));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (timedOut) return;
      reject(new Error(`Failed to start 7z: ${err.message}`));
    });
  });
}

// ─── Public API ───

export async function extractArchive(
  archivePath: string,
  gameId: string,
  modName: string,
  password?: string,
  onProgress?: (stage: string, percent: number, message: string) => void,
): Promise<string> {
  const stat = fs.statSync(archivePath);
  if (stat.size === 0) {
    throw new Error(`Archive is empty: ${archivePath}`);
  }

  const stagingDir = getStagingPath(archivePath, gameId, modName);
  prepareStagingDir(stagingDir);

  const ext = path.extname(archivePath).toLowerCase();
  onProgress?.("extracting", 0, "Extraindo arquivos...");

  if (ext === ".zip" || ext === ".fomod") {
    await extractZip(archivePath, stagingDir, onProgress);
  } else {
    await extract7z(archivePath, stagingDir, password, onProgress);
  }

  return finalizeExtraction(stagingDir);
}
