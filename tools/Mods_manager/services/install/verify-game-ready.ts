/**
 * verifyGameReady — Verificação modular de pré-requisitos antes de instalar mods.
 *
 * Checa:
 * 1. gamePath configurado e existe no disco
 * 2. stagingDir configurado (ou cria default)
 * 3. prefix configurado e válido (user.reg, system.reg, drive_c, dosdevices)
 * 4. Proton configurado (protonPath)
 *
 * Retorna resultado estruturado que o UI pode usar pra mostrar popup.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ModStorageService } from "@main/services";
import { getGameModule } from "@games/registry";
import { getStagingDir } from "@games/_shared/filemap";
import { detectGame } from "@mods/services/detection";
import { defaultStagingDir, defaultPrefixDir } from "@mods/services/steam-library";

export interface CheckResult {
  ok: boolean;
  checks: Check[];
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  action?: "configure" | "create_prefix" | "install_proton";
}

function isValidPrefix(pfxPath: string): boolean {
  return (
    fs.existsSync(path.join(pfxPath, "user.reg")) &&
    fs.existsSync(path.join(pfxPath, "system.reg")) &&
    fs.existsSync(path.join(pfxPath, "drive_c")) &&
    fs.existsSync(path.join(pfxPath, "dosdevices"))
  );
}

function resolvePrefixDir(prefixPath: string): string | null {
  if (!prefixPath) return null;
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) return prefixPath;
  if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) return path.join(prefixPath, "pfx");
  return null;
}

function expandHome(p: string): string {
  if (p.startsWith("~")) return p.replace("~", os.homedir());
  return p;
}

export function verifyGameReady(gameId: string): CheckResult {
  const checks: Check[] = [];
  let gameConfig = ModStorageService.get<any>(`game:${gameId}:config`);
  const gameModule = getGameModule(gameId, gameConfig?.gamePath || "");
  const gameName = gameModule.displayName || gameId;

  // ── Auto-detect se não tem gamePath configurado ──
  let rawGamePath = gameConfig?.gamePath || "";
  if (!rawGamePath) {
    const detected = detectGame(gameId);
    if (detected.source && detected.gamePath) {
      rawGamePath = detected.gamePath;
      const staging = defaultStagingDir(gameId);
      const prefix = detected.prefixPath || defaultPrefixDir(gameId);

      ModStorageService.put(`game:${gameId}:config`, {
        gamePath: rawGamePath,
        stagingDir: gameConfig?.stagingDir || staging,
        protonPrefix: gameConfig?.protonPrefix || prefix,
        protonVersion: gameConfig?.protonVersion || "",
      });

      gameConfig = ModStorageService.get<any>(`game:${gameId}:config`);
    }
  }
  const gamePath = rawGamePath ? expandHome(rawGamePath) : "";

  if (!rawGamePath) {
    checks.push({
      id: "game_path",
      label: "Caminho do jogo",
      ok: false,
      message: `${gameName}: caminho do jogo não configurado`,
      action: "configure",
    });
  } else if (!fs.existsSync(gamePath)) {
    checks.push({
      id: "game_path",
      label: "Caminho do jogo",
      ok: false,
      message: `${gameName}: caminho não encontrado: ${gamePath}`,
      action: "configure",
    });
  } else {
    checks.push({
      id: "game_path",
      label: "Caminho do jogo",
      ok: true,
      message: `${gameName}: ${gamePath}`,
    });
  }

  // ── 2. Staging Dir ──
  const rawStagingDir = gameConfig?.stagingDir || "";
  const stagingDir = rawStagingDir
    ? expandHome(rawStagingDir)
    : getStagingDir(gameId);

  if (!fs.existsSync(stagingDir)) {
    try {
      fs.mkdirSync(stagingDir, { recursive: true });
      checks.push({
        id: "staging_dir",
        label: "Pasta de mods",
        ok: true,
        message: `Pasta criada: ${stagingDir}`,
      });
    } catch {
      checks.push({
        id: "staging_dir",
        label: "Pasta de mods",
        ok: false,
        message: `Não foi possível criar: ${stagingDir}`,
        action: "configure",
      });
    }
  } else {
    checks.push({
      id: "staging_dir",
      label: "Pasta de mods",
      ok: true,
      message: `Pasta: ${stagingDir}`,
    });
  }

  // ── 3. Prefix ──
  const rawPrefix = gameConfig?.protonPrefix || "";
  const prefixPath = rawPrefix ? expandHome(rawPrefix) : "";

  if (!rawPrefix) {
    checks.push({
      id: "prefix",
      label: "Prefixo Wine/Proton",
      ok: false,
      message: "Prefixo não configurado. Clique em 'Criar Prefixo' para preparar o ambiente.",
      action: "create_prefix",
    });
  } else {
    const resolvedPrefix = resolvePrefixDir(prefixPath);
    if (!resolvedPrefix) {
      checks.push({
        id: "prefix",
        label: "Prefixo Wine/Proton",
        ok: false,
        message: `Prefixo não encontrado: ${prefixPath}. Clique em 'Criar Prefixo' para criá-lo.`,
        action: "create_prefix",
      });
    } else if (!isValidPrefix(resolvedPrefix)) {
      checks.push({
        id: "prefix",
        label: "Prefixo Wine/Proton",
        ok: false,
        message: `Prefixo incompleto: ${resolvedPrefix}. Clique em 'Criar Prefixo' para recriá-lo.`,
        action: "create_prefix",
      });
    } else {
      checks.push({
        id: "prefix",
        label: "Prefixo Wine/Proton",
        ok: true,
        message: `Prefixo: ${resolvedPrefix}`,
      });
    }
  }

  // ── 4. Proton ──
  const protonPath = gameConfig?.protonVersion || ModStorageService.get<string>("proton_binary") || "";
  if (!protonPath) {
    checks.push({
      id: "proton",
      label: "Proton",
      ok: false,
      message: "Proton não configurado. Clique em 'Preparar Prefixo' para configurar.",
      action: "install_proton",
    });
  } else {
    checks.push({
      id: "proton",
      label: "Proton",
      ok: true,
      message: `Proton: ${protonPath}`,
    });
  }

  const allOk = checks.every(c => c.ok);
  return { ok: allOk, checks };
}
