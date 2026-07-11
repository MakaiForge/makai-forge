/**
 * Archive Reader — Lê informações de um archive SEM extrair.
 *
 * Usa `7z l -slt` para listar conteúdo com CRC32 e tamanhos.
 * Não extrai nenhum arquivo — apenas lê metadados.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { get7zPath } from "../../play/sevenz";
import type { ArchiveInfo, ArchiveEntry } from "@types/install.types";

/**
 * Lê informações completas de um archive.
 *
 * @param archivePath Caminho completo do archive
 * @returns ArchiveInfo com lista de arquivos, tamanhos e CRC32
 *
 * @example
 * ```ts
 * const info = await readArchiveInfo("/home/user/mods/RaceMenu.7z");
 * console.log(`${info.totalFiles} arquivos, ${info.totalSize} bytes`);
 * ```
 */
export async function readArchiveInfo(archivePath: string): Promise<ArchiveInfo> {
  return new Promise((resolve, reject) => {
    const args = ["l", archivePath, "-slt"]; // -slt = output detalhado
    const child = spawn(get7zPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        // Verificar se é password protected
        if (/wrong password|encrypted|can not open/i.test(stderr)) {
          reject(new Error("ARCHIVE_PASSWORD_PROTECTED"));
          return;
        }
        reject(new Error(`7z listing failed: ${stderr}`));
        return;
      }

      try {
        const isPasswordProtected = /wrong password|encrypted|can not open/i.test(stderr);
        const info = parse7zListing(stdout, archivePath);
        info.isPasswordProtected = isPasswordProtected;
        resolve(info);
      } catch (err) {
        reject(err);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start 7z: ${err.message}`));
    });
  });
}

/**
 * Verifica se um archive é protegido por senha.
 */
export async function checkPasswordProtected(archivePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(get7zPath(), ["t", archivePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && /wrong password|encrypted|can not open/i.test(stderr)) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    child.on("error", () => resolve(false));
  });
}

/**
 * Parse do output do `7z l -slt`.
 *
 * Formato esperado:
 * ```
 * Path = meshes/characters/femalehead.dds
 * Size = 1048576
 * Pack Size = 524288
 * CRC = A1B2C3D4
 * ```
 */
function parse7zListing(output: string, archivePath: string): ArchiveInfo {
  const lines = output.split("\n");
  const entries: ArchiveEntry[] = [];
  let currentEntry: Partial<ArchiveEntry> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("Path = ")) {
      // Salvar entry anterior
      if (currentEntry.path) {
        entries.push(currentEntry as ArchiveEntry);
      }
      currentEntry = {
        path: trimmed.slice(7),
        size: 0,
        compressedSize: 0,
        isDirectory: false,
      };
    } else if (trimmed.startsWith("Size = ")) {
      currentEntry.size = parseInt(trimmed.slice(7), 10) || 0;
    } else if (trimmed.startsWith("Pack Size = ")) {
      currentEntry.compressedSize = parseInt(trimmed.slice(12), 10) || 0;
    } else if (trimmed.startsWith("CRC = ")) {
      currentEntry.crc32 = trimmed.slice(6);
    } else if (trimmed.startsWith("Folder = +")) {
      currentEntry.isDirectory = true;
    }
  }

  // Último entry
  if (currentEntry.path) {
    entries.push(currentEntry as ArchiveEntry);
  }

  // Calcular totais
  let totalSize = 0;
  let compressedSize = 0;
  let totalFiles = 0;

  for (const entry of entries) {
    if (!entry.isDirectory) {
      totalSize += entry.size;
      compressedSize += entry.compressedSize;
      totalFiles++;
    }
  }

  // Detectar formato
  const format = detectFormat(archivePath);
  const name = path.basename(archivePath);

  return {
    path: archivePath,
    name,
    totalSize,
    totalFiles,
    compressedSize,
    format,
    isPasswordProtected: false,
    entries,
  };
}

/**
 * Detecta o formato do archive pela extensão.
 */
function detectFormat(filePath: string): ArchiveInfo["format"] {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".zip") || lower.endsWith(".fomod")) return "zip";
  if (lower.endsWith(".7z")) return "7z";
  if (lower.endsWith(".rar")) return "rar";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  return "zip";
}
