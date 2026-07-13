/**
 * verifyGameReady — Wrapper fino que chama EnvironmentScanner
 * e mapeia o resultado para CheckResult[].
 *
 * NÃO faz leitura de disco. Tudo vem do EnvironmentScanner.
 */

import { scanEnvironment, type EnvironmentStatus } from "../environment-scanner";

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

export function verifyGameReady(gameId: string): CheckResult {
  const env = scanEnvironment({ gameId, autoFix: true });
  const checks = mapToChecks(env);
  const allOk = checks.every(c => c.ok);
  return { ok: allOk, checks };
}

function mapToChecks(env: EnvironmentStatus): Check[] {
  const checks: Check[] = [];

  // ── 1. Game path ──
  if (!env.gamePath) {
    checks.push({
      id: "game_path",
      label: "Caminho do jogo",
      ok: false,
      message: "Caminho do jogo não configurado",
      action: "configure",
    });
  } else if (!env.gamePathExists) {
    checks.push({
      id: "game_path",
      label: "Caminho do jogo",
      ok: false,
      message: `Caminho não encontrado: ${env.gamePath}`,
      action: "configure",
    });
  } else {
    checks.push({
      id: "game_path",
      label: "Caminho do jogo",
      ok: true,
      message: env.gamePath,
    });
  }

  // ── 2. Staging dir ──
  checks.push({
    id: "staging_dir",
    label: "Pasta de mods",
    ok: true,
    message: `Pasta: ${env.stagingDir}`,
  });

  // ── 3. Prefix ──
  if (!env.prefixPath) {
    checks.push({
      id: "prefix",
      label: "Prefixo Wine/Proton",
      ok: false,
      message: "Prefixo não configurado. Clique em 'Criar Prefixo' para preparar o ambiente.",
      action: "create_prefix",
    });
  } else if (!env.prefixValid) {
    checks.push({
      id: "prefix",
      label: "Prefixo Wine/Proton",
      ok: false,
      message: `Prefixo incompleto: ${env.prefixPath}. Clique em 'Criar Prefixo' para recriá-lo.`,
      action: "create_prefix",
    });
  } else {
    checks.push({
      id: "prefix",
      label: "Prefixo Wine/Proton",
      ok: true,
      message: `Prefixo: ${env.prefixPath}`,
    });
  }

  // ── 4. Proton ──
  if (!env.protonPath) {
    checks.push({
      id: "proton",
      label: "Proton",
      ok: false,
      message: "Proton não configurado. Clique em 'Preparar Prefixo' para configurar.",
      action: "install_proton",
    });
  } else if (!env.protonExists) {
    checks.push({
      id: "proton",
      label: "Proton",
      ok: false,
      message: `Proton não encontrado: ${env.protonPath}`,
      action: "install_proton",
    });
  } else {
    checks.push({
      id: "proton",
      label: "Proton",
      ok: true,
      message: `Proton: ${env.protonPath}`,
    });
  }

  return checks;
}
