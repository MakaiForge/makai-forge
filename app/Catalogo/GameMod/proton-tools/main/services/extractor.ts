import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";

function log(line: string) {
  logger.info(line);
  WindowManager.mainWindow?.webContents.send("on-install-log", line);
}

export interface ExtractResult {
  success: boolean;
  extractPath?: string;
  error?: string;
}

export async function extractArchive(
  filePath: string,
  destinationDir: string,
  expectedFolderName: string
): Promise<ExtractResult> {
  const fileName = path.basename(filePath).toLowerCase();

  try {
    if (fileName.endsWith(".zip")) {
      return await extractZip(filePath, destinationDir, expectedFolderName);
    } else if (fileName.endsWith(".xz")) {
      return await extractTar(
        filePath,
        destinationDir,
        expectedFolderName,
        "J"
      );
    } else {
      return await extractTar(
        filePath,
        destinationDir,
        expectedFolderName,
        "z"
      );
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function extractTar(
  filePath: string,
  destinationDir: string,
  expectedFolderName: string,
  flag: string
): Promise<ExtractResult> {
  return new Promise((resolve) => {
    let before: string[] = [];
    try {
      before = fs.readdirSync(destinationDir);
    } catch {
      before = [];
    }
    log(`[extrator] Extraindo ${path.basename(filePath)} para ${destinationDir}`);
    log(`[extrator] Antes da extração: ${before.length} entradas em ${destinationDir}`);

    exec(`tar -x${flag}f "${filePath}" -C "${destinationDir}"`, (error) => {
      if (error) {
        logger.error(`Failed to extract tar:`, error);
        log(`[extrator] ERRO: ${error.message}`);
        resolve({ success: false, error: String(error) });
        return;
      }

      const after = fs.readdirSync(destinationDir);
      const newEntries = after.filter((e) => !before.includes(e));
      log(`[extrator] Depois da extração: ${after.length} entradas`);
      log(`[extrator] Novas entradas: ${newEntries.join(", ") || "(nenhuma)"}`);

      const actualDir = findNewDirectory(destinationDir, before);
      let extractPath: string;
      if (actualDir) {
        extractPath = path.join(destinationDir, actualDir);
        log(`[extrator] Nova pasta detectada: "${actualDir}"`);
      } else {
        extractPath = path.join(destinationDir, expectedFolderName);
        log(`[extrator] Nenhuma nova pasta detectada, usando expectedFolderName: "${expectedFolderName}"`);
      }

      const hasProton = fs.existsSync(path.join(extractPath, "proton"));
      log(`[extrator] Caminho final: ${extractPath} | proton binário: ${hasProton ? "ENCONTRADO" : "NÃO ENCONTRADO"}`);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      resolve({ success: true, extractPath });
    });
  });
}

async function extractZip(
  filePath: string,
  destinationDir: string,
  expectedFolderName: string
): Promise<ExtractResult> {
  return new Promise((resolve) => {
    let before: string[] = [];
    try {
      before = fs.readdirSync(destinationDir);
    } catch {
      before = [];
    }
    log(`[extrator] Extraindo ZIP ${path.basename(filePath)} para ${destinationDir}`);
    log(`[extrator] Antes da extração: ${before.length} entradas`);

    exec(`unzip -o "${filePath}" -d "${destinationDir}"`, (error) => {
      if (error) {
        logger.error(`Failed to extract zip:`, error);
        log(`[extrator] ERRO: ${error.message}`);
        resolve({ success: false, error: String(error) });
        return;
      }

      const after = fs.readdirSync(destinationDir);
      const newEntries = after.filter((e) => !before.includes(e));
      log(`[extrator] Novas entradas: ${newEntries.join(", ") || "(nenhuma)"}`);

      const actualDir = findNewDirectory(destinationDir, before);
      let extractPath: string;
      if (actualDir) {
        extractPath = path.join(destinationDir, actualDir);
        log(`[extrator] Nova pasta detectada: "${actualDir}"`);
      } else {
        extractPath = path.join(destinationDir, expectedFolderName);
        log(`[extrator] Nenhuma nova pasta, usando expectedFolderName: "${expectedFolderName}"`);
      }

      const hasProton = fs.existsSync(path.join(extractPath, "proton"));
      log(`[extrator] proton binário: ${hasProton ? "ENCONTRADO" : "NÃO ENCONTRADO"} em ${extractPath}`);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      resolve({ success: true, extractPath });
    });
  });
}

function findNewDirectory(destinationDir: string, before: string[]): string | null {
  let after: string[];
  try {
    after = fs.readdirSync(destinationDir);
  } catch {
    return null;
  }

  const newEntries = after.filter((entry) => !before.includes(entry));

  for (const entry of newEntries) {
    const fullPath = path.join(destinationDir, entry);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        return entry;
      }
    } catch {
      continue;
    }
  }

  return newEntries[0] || null;
}
