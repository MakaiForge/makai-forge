/**
 * overwrite-check.ts — Verifica se um mod já existe no staging.
 *
 * Retorna informações sobre o mod existente para que o renderer
 * possa mostrar um dialog de substituição/renomeação.
 */

import fs from "node:fs";
import path from "node:path";
import { ModStorageService } from "@main/services";
import { readModMeta } from "./meta-writer";
import { mkMlKey } from "../storage-keys";


export interface OverwriteInfo {
  /** Se o mod já existe no disco */
  exists: boolean;
  /** Se o mod está na modlist do perfil ativo */
  inProfile: boolean;
  /** Nome do mod existente */
  existingName: string;
  /** Diretório do mod existente no staging */
  existingDir: string;
  /** Data da instalação anterior (de meta.ini) */
  installedAt?: string;
  /** Arquivo que foi instalado anteriormente */
  previousArchive?: string;
  /** Número de arquivos no mod existente */
  fileCount?: number;
}

/**
 * Verifica se um mod com o mesmo nome já existe no staging.
 */
export function checkOverwrite(
  gameId: string,
  profile: string,
  modName: string,
  stagingDir: string,
): OverwriteInfo {
  const modDir = path.join(stagingDir, modName);

  if (!fs.existsSync(modDir)) {
    return { exists: false, inProfile: false, existingName: modName, existingDir: modDir };
  }

  // Check if mod is in the active profile's modlist
  const modlistKey = mkMlKey(gameId, profile);
  const modlist: Array<{ name: string }> = ModStorageService.get(modlistKey) || [];
  const inProfile = modlist.some((m) => m.name === modName);

  // Ler metadata existente
  const meta = readModMeta(modDir);
  let fileCount = 0;
  try {
    const walk = (dir: string): number => {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += walk(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
      return count;
    };
    fileCount = walk(modDir);
  } catch { /* ignore */ }

  return {
    exists: true,
    inProfile,
    existingName: modName,
    existingDir: modDir,
    installedAt: meta?.["General.installed"],
    previousArchive: meta?.["General.installationFile"],
    fileCount,
  };
}
