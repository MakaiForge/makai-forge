import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { logger } from "@main/services";
import { get7zPath } from "@mods/play/sevenz";
import type { ExternalToolDef } from "@games/_shared/types";

/**
 * Base directory for all external tools: ~/.config/makai-forger/tools/
 */
function getToolsBaseDir(): string {
  return path.join(os.homedir(), ".config", "makai-forger", "tools");
}

/**
 * Get the install directory for a specific tool of a specific game.
 * e.g. ~/.config/makai-forger/tools/skyrim/LOOT/
 */
export function getToolInstallDir(gameId: string, toolName: string): string {
  const safeName = toolName.replace(/[\/\\]/g, "_");
  return path.join(getToolsBaseDir(), gameId, safeName);
}

/**
 * Get the tools directory for a game (all tools).
 * e.g. ~/.config/makai-forger/tools/skyrim/
 */
export function getGameToolsDir(gameId: string): string {
  return path.join(getToolsBaseDir(), gameId);
}

/**
 * Check if an external tool is already installed.
 */
export function isToolInstalled(gameId: string, tool: ExternalToolDef): boolean {
  const toolDir = getToolInstallDir(gameId, tool.name);
  if (tool.detector?.folder) {
    return fs.existsSync(path.join(toolDir, tool.detector.folder));
  }
  if (tool.detector?.file) {
    return fs.existsSync(path.join(toolDir, tool.detector.file));
  }
  return fs.existsSync(path.join(toolDir, tool.exeName));
}

/**
 * Resolve the real executable path for a tool.
 */
export function resolveToolPath(gameId: string, tool: ExternalToolDef): string | null {
  const toolDir = getToolInstallDir(gameId, tool.name);
  if (tool.detector?.file) {
    const p = path.join(toolDir, tool.detector.file);
    if (fs.existsSync(p)) return p;
  }
  if (tool.detector?.folder) {
    const p = path.join(toolDir, tool.detector.folder, tool.exeName);
    if (fs.existsSync(p)) return p;
  }
  const p = path.join(toolDir, tool.exeName);
  if (fs.existsSync(p)) return p;
  return null;
}

/**
 * Download and install an external tool into its game-specific directory.
 */
export async function installTool(
  gameId: string,
  tool: ExternalToolDef,
  send?: (step: string, msg: string, type: string) => void,
): Promise<boolean> {
  if (!tool.downloadUrl) return false;

  const toolDir = getToolInstallDir(gameId, tool.name);
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
      const entries = fs.readdirSync(extractDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      const files = entries.filter(e => e.isFile());
      if (dirs.length === 1 && files.length === 0) {
        sourceDir = path.join(extractDir, dirs[0].name);
      }
    }

    send?.("tools", `📋 Instalando ${tool.name}...`, "working");
    fs.mkdirSync(toolDir, { recursive: true });
    copyRecursive(sourceDir, toolDir);

    const installed = isToolInstalled(gameId, tool);
    if (installed) {
      send?.("tools", `✅ ${tool.name} instalado em ${toolDir}`, "done");
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
  gameId: string,
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
    if (isToolInstalled(gameId, tool)) {
      send?.("tools", `✅ ${tool.name} já instalado`, "done");
      skipped.push(tool.name);
      continue;
    }

    const ok = await installTool(gameId, tool, send);
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
      try { fs.chmodSync(dstPath, 0o755); } catch { /* skip */ }
    }
  }
}
