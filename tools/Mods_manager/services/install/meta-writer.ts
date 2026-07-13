/**
 * meta-writer.ts — Grava meta.ini no diretório de staging do mod.
 *
 * Formato compatível com Amethyst/Mod Organizer 2.
 * Usa GameModule para decidir o que gravar por jogo.
 */

import fs from "node:fs";
import path from "node:path";
import { getGameModule } from "@games/registry";

export interface MetaOptions {
  gameId: string;
  modName: string;
  modDir: string;
  archivePath: string;
  hasFomod: boolean;
  hasBain: boolean;
  plugins: string[];
  installTime?: Date;
}

/**
 * Grava meta.ini no diretório do mod.
 * Usa GameModule para saber se o jogo usa plugins (Bethesda etc).
 */
export function writeModMeta(options: MetaOptions): void {
  const {
    gameId,
    modName,
    modDir,
    archivePath,
    hasFomod,
    hasBain,
    plugins,
    installTime = new Date(),
  } = options;

  const mod = getGameModule(gameId);
  const gameName = mod?.displayName || gameId;
  const usesPlugins = mod?.shouldWritePluginsTxt?.() ?? false;

  const lines: string[] = [
    "[General]",
    `game = ${gameName}`,
    `gameId = ${gameId}`,
    `installed = ${installTime.toISOString()}`,
    `installationFile = ${path.basename(archivePath)}`,
  ];

  if (hasFomod) lines.push("FOMOD = True");
  if (hasBain) lines.push("BAIN = True");

  // Jogos com plugins (via GameModule): gravar lista
  if (usesPlugins && plugins.length > 0) {
    lines.push("");
    lines.push("[Plugins]");
    for (const plugin of plugins) {
      lines.push(`${plugin} = enabled`);
    }
  }

  lines.push("");

  const metaPath = path.join(modDir, "meta.ini");
  try {
    fs.writeFileSync(metaPath, lines.join("\n"), "utf-8");
  } catch (err) {
    console.error(`[META] Failed to write meta.ini for ${modName}:`, err);
  }
}

/**
 * Lê meta.ini existente (para updates).
 */
export function readModMeta(modDir: string): Record<string, string> | null {
  const metaPath = path.join(modDir, "meta.ini");
  if (!fs.existsSync(metaPath)) return null;

  try {
    const content = fs.readFileSync(metaPath, "utf-8");
    const result: Record<string, string> = {};
    let currentSection = "";
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        result[currentSection ? `${currentSection}.${key}` : key] = value;
      }
    }
    return result;
  } catch {
    return null;
  }
}
