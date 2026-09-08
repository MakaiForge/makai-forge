import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { logger } from "@main/services";
import type { FrameworkDef } from "@games/_shared/types";

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

export async function installFramework(
  gamePath: string,
  framework: FrameworkDef,
  send?: (step: string, msg: string, type: string) => void,
): Promise<boolean> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `fw-${framework.name}-`));

  try {
    const urlLower = framework.downloadUrl.toLowerCase();
    const ext = urlLower.endsWith(".7z") ? "7z" : urlLower.endsWith(".zip") ? "zip" : "zip";
    const archivePath = path.join(tmpDir, `framework.${ext}`);

    send?.("frameworks", `Baixando ${framework.name}...`, "working");
    await MakaiRPC.call("download_file", {
      url: framework.downloadUrl,
      dest: archivePath,
    });

    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
      throw new Error("Download falhou: arquivo vazio");
    }

    send?.("frameworks", `Extraindo ${framework.name}...`, "working");
    const extractDir = path.join(tmpDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    await MakaiRPC.call("extract_archive", {
      archive: archivePath,
      dest: extractDir,
    });

    let sourceDir = extractDir;
    if (framework.innerFolder) {
      const innerPath = path.join(extractDir, framework.innerFolder);
      if (fs.existsSync(innerPath)) {
        sourceDir = innerPath;
      }
    }

    send?.("frameworks", `Instalando ${framework.name}...`, "working");
    copyRecursive(sourceDir, gamePath);

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

    const installed = isFrameworkInstalled(gamePath, framework);
    if (installed) {
      send?.("frameworks", `${framework.name} instalado com sucesso`, "done");
    } else {
      send?.("frameworks", `${framework.name} instalado mas detector não encontrou arquivo esperado`, "done");
    }

    return installed;
  } catch (err) {
    const msg = String(err).slice(0, 200);
    logger.error(`[Framework] ${framework.name} install failed: ${msg}`);
    send?.("frameworks", `Falha ao instalar ${framework.name}: ${msg}`, "error");
    return false;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* skip */ }
  }
}

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
      send?.("frameworks", `${fw.name} já instalado`, "done");
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
