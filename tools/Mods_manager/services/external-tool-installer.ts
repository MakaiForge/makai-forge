import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { logger } from "@main/services";
import { get7zPath } from "@mods/play/sevenz";
import type { ExternalToolDef } from "@games/_shared/types";

/**
 * Check if an external tool is already installed in the game directory.
 */
export function isToolInstalled(gamePath: string, tool: ExternalToolDef): boolean {
  if (tool.detector?.folder) {
    return fs.existsSync(path.join(gamePath, tool.detector.folder));
  }
  if (tool.detector?.file) {
    return fs.existsSync(path.join(gamePath, tool.detector.file));
  }
  return fs.existsSync(path.join(gamePath, tool.exeName));
}

/**
 * Resolve the real executable path for a tool (may be inside a subfolder).
 */
export function resolveToolPath(gamePath: string, tool: ExternalToolDef): string | null {
  if (tool.detector?.file) {
    const p = path.join(gamePath, tool.detector.file);
    if (fs.existsSync(p)) return p;
  }
  if (tool.detector?.folder) {
    const p = path.join(gamePath, tool.detector.folder, tool.exeName);
    if (fs.existsSync(p)) return p;
  }
  const p = path.join(gamePath, tool.exeName);
  if (fs.existsSync(p)) return p;
  return null;
}

/**
 * Download and install an external tool into the game directory.
 * Uses curl for download and 7z for extraction.
 */
export async function installTool(
  gamePath: string,
  tool: ExternalToolDef,
  send?: (step: string, msg: string, type: string) => void,
): Promise<boolean> {
  if (!tool.downloadUrl) return false;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tool-${tool.name.replace(/\s+/g, "_")}-`));

  try {
    const urlLower = tool.downloadUrl.toLowerCase();
    const ext = urlLower.endsWith(".7z") ? "7z" : urlLower.endsWith(".zip") ? "zip" : "zip";
    const archivePath = path.join(tmpDir, `tool.${ext}`);

    send?.("tools", `⬇️ Baixando ${tool.name}...`, "working");
    execSync(`curl -sL --connect-timeout 30 --max-time 300 -L "${tool.downloadUrl}" -o "${archivePath}"`, {
      stdio: "pipe",
      timeout: 360000,
    });

    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
      throw new Error(`Download falhou: arquivo vazio`);
    }

    send?.("tools", `📦 Extraindo ${tool.name}...`, "working");
    const extractDir = path.join(tmpDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    const sevenz = get7zPath();
    execSync(`${sevenz} x "${archivePath}" -o"${extractDir}" -y`, {
      stdio: "pipe",
      timeout: 60000,
    });

    let sourceDir = extractDir;
    if (tool.innerFolder) {
      const innerPath = path.join(extractDir, tool.innerFolder);
      if (fs.existsSync(innerPath)) {
        sourceDir = innerPath;
      }
    } else {
      // Auto-detect: if extract root has exactly 1 subfolder and 0 files,
      // use that subfolder as source (e.g. LOOT extracts to loot_version/)
      const entries = fs.readdirSync(extractDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      const files = entries.filter(e => e.isFile());
      if (dirs.length === 1 && files.length === 0) {
        sourceDir = path.join(extractDir, dirs[0].name);
      }
    }

    send?.("tools", `📋 Instalando ${tool.name}...`, "working");
    copyRecursive(sourceDir, gamePath);

    const installed = isToolInstalled(gamePath, tool);
    if (installed) {
      send?.("tools", `✅ ${tool.name} instalado com sucesso`, "done");
    } else {
      send?.("tools", `⚠️ ${tool.name} instalado mas exe não encontrado`, "done");
    }

    return installed;
  } catch (err) {
    const msg = String(err).slice(0, 200);
    logger.error(`[Tool] ${tool.name} install failed: ${msg}`);
    send?.("tools", `❌ Falha ao instalar ${tool.name}: ${msg}`, "error");
    return false;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* skip */ }
  }
}

/**
 * Ensure all external tools with downloadUrl are installed.
 */
export async function ensureExternalTools(
  gamePath: string,
  tools: ExternalToolDef[],
  send?: (step: string, msg: string, type: string) => void,
): Promise<{ installed: string[]; skipped: string[]; failed: string[] }> {
  const installed: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  const downloadable = tools.filter(t => t.downloadUrl);
  if (downloadable.length === 0) {
    return { installed, skipped, failed };
  }

  for (const tool of downloadable) {
    if (isToolInstalled(gamePath, tool)) {
      send?.("tools", `✅ ${tool.name} já instalado`, "done");
      skipped.push(tool.name);
      continue;
    }

    const ok = await installTool(gamePath, tool, send);
    if (ok) {
      installed.push(tool.name);
    } else {
      failed.push(tool.name);
    }
  }

  return { installed, skipped, failed };
}

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
    }
  }
}
