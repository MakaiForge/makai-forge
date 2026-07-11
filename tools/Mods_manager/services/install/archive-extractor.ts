/**
 * Archive Extractor — Extrai archives com progresso por arquivo.
 *
 * Usa `7z x` e parseia stdout para rastrear cada arquivo extraído.
 * Suporta .7z, .zip, .rar, .tar.gz.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { get7zPath } from "../../play/sevenz";
import type { ArchiveInfo, ExtractedFile } from "@types/install.types";

type ExtractProgressCallback = (
  filesProcessed: number,
  filesTotal: number,
  bytesProcessed: number,
  bytesTotal: number,
  currentFile: string,
) => void;

/**
 * Extrai um archive para um diretório de destino com progresso.
 *
 * @param archivePath Caminho do archive
 * @param targetDir Diretório de destino (staging)
 * @param archiveInfo Informações do archive (obtidas via readArchiveInfo)
 * @param password Senha opcional
 * @param onProgress Callback de progresso
 * @param abortSignal Signal para cancelar
 * @returns Lista de arquivos extraídos com tamanhos
 */
export async function extractWithProgress(
  archivePath: string,
  targetDir: string,
  archiveInfo: ArchiveInfo,
  password?: string,
  onProgress?: ExtractProgressCallback,
  abortSignal?: AbortSignal,
): Promise<ExtractedFile[]> {
  // Preparar diretório
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const args = ["x", archivePath, `-o${targetDir}`, "-y", "-bsp1"];
  if (password) args.push(`-p${password}`);

  return new Promise((resolve, reject) => {
    const child = spawn(get7zPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let filesProcessed = 0;
    const filesTotal = archiveInfo.totalFiles;
    let bytesProcessed = 0;
    const bytesTotal = archiveInfo.totalSize;
    let currentFile = "";
    const extractedFiles: ExtractedFile[] = [];

    // Indexar entries por path para lookup rápido
    const entryMap = new Map<string, ArchiveInfo["entries"][0]>();
    for (const entry of archiveInfo.entries) {
      entryMap.set(entry.path, entry);
      // Also try with forward slashes (7z may normalize)
      entryMap.set(entry.path.replace(/\\/g, "/"), entry);
    }

    // Parse da saída do 7z para rastrear arquivos
    // Formato: "Extracting  path/to/file.ext" ou "Extracting path\to\file.ext"
    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        const match = line.match(/Extracting\s+(.+)/);
        if (match) {
          currentFile = match[1].trim();

          // Encontrar info do arquivo no archiveInfo
          const archiveEntry = entryMap.get(currentFile) ||
            entryMap.get(currentFile.replace(/\\/g, "/"));

          if (archiveEntry && !archiveEntry.isDirectory) {
            filesProcessed++;
            bytesProcessed += archiveEntry.size;

            // Registrar arquivo extraído
            const absolutePath = path.join(targetDir, currentFile);
            extractedFiles.push({
              relativePath: currentFile,
              absolutePath,
              expectedSize: archiveEntry.size,
              actualSize: 0, // Será verificado depois
              expectedCrc32: archiveEntry.crc32,
              actualCrc32: undefined,
              verified: false,
            });

            // Reportar progresso
            onProgress?.(
              filesProcessed,
              filesTotal,
              bytesProcessed,
              bytesTotal,
              currentFile,
            );
          }
        }
      }
    });

    child.stderr?.on("data", (_data: Buffer) => {
      // Ignorar erros menores do stderr
    });

    // Verificar abort
    abortSignal?.addEventListener("abort", () => {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* dead already */
        }
      }, 2000);
      reject(new Error("EXTRACTION_ABORTED"));
    });

    child.on("close", (code) => {
      if (code === 0) {
        // Atualizar tamanhos reais dos arquivos extraídos
        for (const file of extractedFiles) {
          try {
            const stat = fs.statSync(file.absolutePath);
            file.actualSize = stat.size;
          } catch {
            file.actualSize = 0;
          }
        }
        resolve(extractedFiles);
      } else {
        reject(new Error(`Extraction failed with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start 7z: ${err.message}`));
    });
  });
}
