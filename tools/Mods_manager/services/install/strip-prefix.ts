/**
 * strip-prefix.ts — Detecção automática de strip prefixes
 *
 * Detecta a estrutura do mod e remove prefixes desnecessários.
 * Exemplo: "Data/Scripts/foo.pex" → "Scripts/foo.pex"
 *
 * Baseado no Amethyst install_mod.py lines 2441-2557
 */

import * as fs from "fs";
import * as path from "path";

export interface StripPrefixResult {
  /** Prefixo detectado (ou null se nenhum) */
  detectedPrefix: string | null;
  /** Lista de todos os prefixos detectados */
  allPrefixes: string[];
  /** Se a estrutura é válida para o jogo */
  isValid: boolean;
  /** Top-level folders encontrados */
  topLevelFolders: string[];
  /** Se precisa de ação do usuário */
  needsUserInput: boolean;
}

/**
 * Detecta strip prefix para um mod
 *
 * @param modDir Diretório do mod no staging
 * @param requiredFolders Pastas obrigatórias para o jogo (ex: ["scripts", "meshes", "textures"])
 * @param knownPrefixes Prefixos conhecidos para strip (ex: ["Data", "data"])
 */
export function detectStripPrefix(
  modDir: string,
  requiredFolders: string[] = [],
  knownPrefixes: string[] = ["Data", "data"]
): StripPrefixResult {
  if (!fs.existsSync(modDir)) {
    return {
      detectedPrefix: null,
      allPrefixes: [],
      isValid: false,
      topLevelFolders: [],
      needsUserInput: false,
    };
  }

  // Listar top-level items
  const items = fs.readdirSync(modDir, { withFileTypes: true });
  const topLevelFolders = items
    .filter(i => i.isDirectory())
    .map(i => i.name);
  const topLevelFiles = items
    .filter(i => i.isFile())
    .map(i => i.name);

  // Verificar se algum top-level folder é um prefixo conhecido
  const detectedPrefixes: string[] = [];
  for (const folder of topLevelFolders) {
    if (knownPrefixes.includes(folder)) {
      detectedPrefixes.push(folder);
    }
  }

  // Se temos prefixos detectados, usar o primeiro
  const detectedPrefix = detectedPrefixes.length > 0 ? detectedPrefixes[0] : null;

  // Se tem prefixo, verificar estrutura dentro dele
  let effectiveTopLevel = topLevelFolders;
  if (detectedPrefix) {
    const prefixDir = path.join(modDir, detectedPrefix);
    const prefixItems = fs.readdirSync(prefixDir, { withFileTypes: true });
    effectiveTopLevel = prefixItems
      .filter(i => i.isDirectory())
      .map(i => i.name);
  }

  // Verificar se a estrutura é válida
  let isValid = true;
  let needsUserInput = false;

  if (requiredFolders.length > 0) {
    const effectiveTopLower = effectiveTopLevel.map(f => f.toLowerCase());
    const hasRequired = requiredFolders.some(f =>
      effectiveTopLower.includes(f.toLowerCase())
    );

    if (!hasRequired && topLevelFiles.length === 0) {
      // Não tem pastas obrigatórias nem arquivos na raiz
      // Pode ser que precise de outro prefixo ou de input do usuário
      isValid = false;
      needsUserInput = true;
    }
  }

  return {
    detectedPrefix,
    allPrefixes: detectedPrefixes,
    isValid,
    topLevelFolders: effectiveTopLevel,
    needsUserInput,
  };
}

/**
 * Aplica strip prefix a uma lista de arquivos
 *
 * @param files Lista de arquivos relativos ao modDir
 * @param prefix Prefixo para remover
 */
export function applyStripPrefix(
  files: Array<{ relPath: string; relKey: string }>,
  prefix: string
): Array<{ relPath: string; relKey: string }> {
  const prefixLower = prefix.toLowerCase() + "/";

  return files.map(file => {
    if (file.relKey.startsWith(prefixLower)) {
      return {
        relPath: file.relPath.substring(prefix.length + 1),
        relKey: file.relKey.substring(prefix.length + 1),
      };
    }
    return file;
  });
}

/**
 * Detecta se um mod tem BAIN
 */
export function hasBain(modDir: string): boolean {
  // BAIN tem pastas numeradas (001, 002, etc) ou "Wizard"
  const items = fs.readdirSync(modDir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && /^\d{3}$/.test(item.name)) {
      return true;
    }
    if (item.isDirectory() && item.name.toLowerCase() === "wizard") {
      return true;
    }
  }
  return false;
}
