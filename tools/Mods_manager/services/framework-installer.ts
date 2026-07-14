import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { logger } from "@main/services";
import { get7zPath } from "@mods/play/sevenz";
import type { FrameworkDef } from "@games/_shared/types";

/**
 * Check if a framework is already installed in the game directory.
 */
export function isFrameworkInstalled(gamePath: string, framework: FrameworkDef): boolean {
  const { detector } = framework;
  if (detector.folder) {
    return fs.existsSync(path.join(gamePath, detector.folder));
  }
  if (detector.file) {
    return fs.existsSync(path.join(gamePath, detector.file));
  }
  return false;
}

/**
 * Download and install a framework into the game directory.
 * Uses curl for download and 7z for extraction.
 */
export async function installFramework(
  gamePath: string,
  framework: FrameworkDef,
  send?: (step: string, msg: string, type: string) => void,
): Promise<boolean> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `fw-${framework.name}-`));

  try {
    // 1. Determine archive extension from URL
    const urlLower = framework.downloadUrl.toLowerCase();
    const ext = urlLower.endsWith(".7z") ? "7z" : urlLower.endsWith(".zip") ? "zip" : "zip";
    const archivePath = path.join(tmpDir, `framework.${ext}`);

    // 2. Download
    send?.("frameworks", `⬇️ Baixando ${framework.name}...`, "working");
    execSync(`curl -sL --connect-timeout 30 --max-time 300 "${framework.downloadUrl}" -o "${archivePath}"`, {
      stdio: "pipe",
      timeout: 360000,
    });

    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
      throw new Error(`Download falhou: arquivo vazio`);
    }

    // 3. Extract
    send?.("frameworks", `📦 Extraindo ${framework.name}...`, "working");
    const extractDir = path.join(tmpDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    const sevenz = get7zPath();
    execSync(`${sevenz} x "${archivePath}" -o"${extractDir}" -y`, {
      stdio: "pipe",
      timeout: 60000,
    });

    // 4. Find source directory (handle inner folder)
    let sourceDir = extractDir;
    if (framework.innerFolder) {
      const innerPath = path.join(extractDir, framework.innerFolder);
      if (fs.existsSync(innerPath)) {
        sourceDir = innerPath;
      }
    }

    // 5. Copy all files to game root
    send?.("frameworks", `📋 Instalando ${framework.name}...`, "working");
    copyRecursive(sourceDir, gamePath);

    // 6. Post-install hooks (chmod, etc.)
    if (framework.chmodFiles) {
      for (const file of framework.chmodFiles) {
        const fullPath = path.join(gamePath, file);
        if (fs.existsSync(fullPath)) {
          try { fs.chmodSync(fullPath, 0o755); } catch { /* skip */ }
        }
      }
    }

    if (framework.postInstall) {
      await framework.postInstall(gamePath);
    }

    // 7. Verify installation
    const installed = isFrameworkInstalled(gamePath, framework);
    if (installed) {
      send?.("frameworks", `✅ ${framework.name} instalado com sucesso`, "done");
    } else {
      send?.("frameworks", `⚠️ ${framework.name} instalado mas detector não encontrou arquivo esperado`, "done");
    }

    return installed;
  } catch (err) {
    const msg = String(err).slice(0, 200);
    logger.error(`[Framework] ${framework.name} install failed: ${msg}`);
    send?.("frameworks", `❌ Falha ao instalar ${framework.name}: ${msg}`, "error");
    return false;
  } finally {
    // Cleanup temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* skip */ }
  }
}

/**
 * Ensure all frameworks for a game are installed.
 * Downloads and installs any missing frameworks.
 */
export async function ensureFrameworks(
  gamePath: string,
  frameworks: FrameworkDef[],
  send?: (step: string, msg: string, type: string) => void,
): Promise<{ installed: string[]; skipped: string[]; failed: string[] }> {
  const installed: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  if (!frameworks || frameworks.length === 0) {
    return { installed, skipped, failed };
  }

  for (const fw of frameworks) {
    if (isFrameworkInstalled(gamePath, fw)) {
      send?.("frameworks", `✅ ${fw.name} já instalado`, "done");
      skipped.push(fw.name);
      continue;
    }

    const ok = await installFramework(gamePath, fw, send);
    if (ok) {
      installed.push(fw.name);
    } else {
      failed.push(fw.name);
    }
  }

  return { installed, skipped, failed };
}

/**
 * Recursively copy all files from src to dst.
 * Does not delete existing files in dst.
 */
function copyRecursive(src: string, dst: string): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(src, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
      // Garantir escrita (corrige permissao 444 ou outras restritivas)
      try { fs.chmodSync(dstPath, 0o755); } catch { /* skip */ }
    }
  }
}
