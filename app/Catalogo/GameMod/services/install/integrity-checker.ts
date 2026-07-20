/**
 * Integrity Checker — Verifica integridade dos arquivos extraídos.
 *
 * Compara cada arquivo extraído com o esperado do archive:
 * - Tamanho igual
 * - Arquivo não está vazio
 *
 * Nota: CRC32 do 7z não pode ser comparado diretamente com MD5 do Node.js.
 * A verificação de integridade usa apenas tamanho. Para CRC32 real,
 * seria necessário usar um pacote npm como 'crc-32'.
 */

import fs from "node:fs";
import type {
  ExtractedFile,
  ArchiveEntry,
  VerificationResult,
  VerificationError,
} from "@types/install.types";

/**
 * Verifica integridade dos arquivos extraídos contra o archive original.
 *
 * @param extractedFiles Lista de arquivos extraídos
 * @param archiveEntries Lista de entries do archive
 * @returns VerificationResult com detalhes da verificação
 */
export function verifyExtractedFiles(
  extractedFiles: ExtractedFile[],
  archiveEntries: ArchiveEntry[],
): VerificationResult {
  const errors: VerificationError[] = [];
  let filesChecked = 0;
  let filesValid = 0;

  // Indexar entries por path para lookup rápido
  const entryMap = new Map<string, ArchiveEntry>();
  for (const entry of archiveEntries) {
    entryMap.set(entry.path, entry);
    entryMap.set(entry.path.replace(/\\/g, "/"), entry);
  }

  for (const extracted of extractedFiles) {
    filesChecked++;

    // Encontrar entry correspondente no archive
    const archiveEntry = entryMap.get(extracted.relativePath) ||
      entryMap.get(extracted.relativePath.replace(/\\/g, "/"));

    if (!archiveEntry) {
      errors.push({
        file: extracted.relativePath,
        type: "missing_file",
        expected: "Present in archive",
        actual: "Not found in archive listing",
      });
      continue;
    }

    // Verificar se arquivo existe no disco
    if (!fs.existsSync(extracted.absolutePath)) {
      errors.push({
        file: extracted.relativePath,
        type: "missing_file",
        expected: `Size: ${archiveEntry.size} bytes`,
        actual: "File not found on disk",
      });
      continue;
    }

    // Verificar tamanho
    const stat = fs.statSync(extracted.absolutePath);
    extracted.actualSize = stat.size;

    if (stat.size === 0) {
      errors.push({
        file: extracted.relativePath,
        type: "empty_file",
        expected: `Size: ${archiveEntry.size} bytes`,
        actual: "Size: 0 bytes",
      });
      continue;
    }

    // Verificar se tamanho bate (ignorar para archives de 0 bytes)
    if (archiveEntry.size > 0 && stat.size !== archiveEntry.size) {
      errors.push({
        file: extracted.relativePath,
        type: "size_mismatch",
        expected: `Size: ${archiveEntry.size} bytes`,
        actual: `Size: ${stat.size} bytes`,
      });
      continue;
    }

    // Arquivo válido (tamanho confere)
    extracted.verified = true;
    filesValid++;
  }

  return {
    allValid: errors.length === 0,
    filesChecked,
    filesValid,
    filesInvalid: errors.length,
    errors,
  };
}
