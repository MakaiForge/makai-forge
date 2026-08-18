import os from "node:os";
import path from "node:path";
import { ModStorageService, logger } from "@main/services";
import { getDeployFunction } from "@games/registry";
import { scanEnvironment } from "@mods/services/environment-scanner";
import { findUsableProton } from "@container/core/init";
import { ensureProton } from "./steps/02-proton";
import { ensurePrefix } from "./steps/03-prefix";
import { applyGameConfigs } from "./steps/04-configs";
import type { ConfigsResult } from "./steps/04-configs";
import { ensureGameFrameworks } from "./steps/05-frameworks";
import { ensureGameExternalTools } from "./steps/05.5-external-tools";
import { ensureSkse } from "./steps/06-skse";
import { launchGame } from "./steps/07-launch";
import { bridgePrefixToSteam } from "@mods/services/steam-prefix-bridge";
import type { SendProgress, PlayResult } from "./types";
import { logPlay } from "./logger";
import { logStep, logEvent, resetStepCounter } from "./activity-logger";

export async function playGame(
  gameId: string,
  send: SendProgress,
  profile?: string,
  deployMods = false,
): Promise<PlayResult> {
  const _startAll = Date.now();
  resetStepCounter();
  logEvent(gameId, "play_started", { profile: profile || "Default" });

  try {
    const usedProfile = profile || "Default";
    logPlay(gameId, "start", { profile: usedProfile });

    // ── Step 0: Scan environment (única fonte de verdade) ──
    logStep(gameId, "scan", "Verificando ambiente...", "working");
    const _s0 = Date.now();
    const env = scanEnvironment({ gameId, autoFix: true });
    logStep(gameId, "scan", env.ready ? "Ambiente pronto" : `${env.errors.length} problema(s) encontrado(s)`, env.ready ? "done" : "error", {
      duration_ms: Date.now() - _s0,
      gamePath: env.gamePath || "",
      prefixValid: String(env.prefixValid),
      protonExists: String(env.protonExists),
    });
    logPlay(gameId, "environment_scan", {
      gamePath: env.gamePath || "",
      prefixValid: String(env.prefixValid),
      protonExists: String(env.protonExists),
      ready: String(env.ready),
    });

    // Bloquear se jogo não encontrado
    if (!env.gamePath) {
      logStep(gameId, "scan", "Jogo não configurado", "error");
      logEvent(gameId, "play_failed", { reason: "game_not_found" });
      return { success: false, error: "Jogo não configurado. Configure em Configurar Jogo.", failedStep: "detect" };
    }
    if (!env.gamePathExists) {
      logStep(gameId, "scan", `Caminho não encontrado: ${env.gamePath}`, "error");
      logEvent(gameId, "play_failed", { reason: "game_not_found" });
      return { success: false, error: `Caminho não encontrado: ${env.gamePath}`, failedStep: "detect" };
    }

    // Reportar erros do scan (prefix inválido, proton ausente, etc)
    // Não bloqueia aqui — os Steps 2-4 tentam corrigir automaticamente
    if (env.errors.length > 0) {
      logStep(gameId, "scan", `Problemas detectados: ${env.errors.join("; ")}`, "error");
      send("warning", `Problemas detectados: ${env.errors.join("; ")}. Tentando corrigir automaticamente...`, "warning");
    }    }

    const gamePath = env.gamePath;
    const steamAppId = env.steamAppId;
    const prefixPath = env.prefixPath || path.join(os.homedir(), "Games", "Makai-forger", gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, ""));
    const libraryPath = env.libraryPath;
    logPlay(gameId, "detect", {
      gamePath: gamePath || "",
      steamAppId: steamAppId || "",
      prefixPath: prefixPath || "",
      libraryPath: libraryPath || "",
    });

    // ── Step 2: Proton ──
    let protonPath: string;
    let useCustomPrefix: boolean;
    if (env.protonExists) {
      // Proton já existe no disco — usar direto (com fallback se não estiver compilado)
      const configuredProton = env.protonPath;
      const usableProton = findUsableProton(configuredProton);
      protonPath = usableProton || configuredProton;
      useCustomPrefix = false;
      if (protonPath !== configuredProton) {
        logStep(gameId, "proton", `⚠️ Proton configurado (${path.basename(configuredProton)}) não está compilado — usando ${path.basename(protonPath)}`, "done");
        logPlay(gameId, "proton", { protonPath, useCustomPrefix: "false", fallbackFrom: configuredProton });
      } else {
        logStep(gameId, "proton", `Proton já configurado: ${protonPath}`, "done");
        logPlay(gameId, "proton", { protonPath, useCustomPrefix: "false" });
      }
    } else {
      try {
        logStep(gameId, "proton", "Verificando Proton...", "working");
        const _s2 = Date.now();
        const protonResult = await ensureProton(gameId, send, prefixPath);
        let resolvedProtonPath = protonResult.protonPath;
        const usableProton = findUsableProton(resolvedProtonPath);
        if (usableProton && usableProton !== resolvedProtonPath) {
          logStep(gameId, "proton", `⚠️ Proton obtido (${path.basename(resolvedProtonPath)}) não utilizável — usando ${path.basename(usableProton)}`, "done");
          resolvedProtonPath = usableProton;
        }
        protonPath = resolvedProtonPath;
        useCustomPrefix = protonResult.useCustomPrefix || false;
        logStep(gameId, "proton", `Proton: ${protonPath}`, "done", { duration_ms: Date.now() - _s2 });
        logPlay(gameId, "proton", { protonPath, useCustomPrefix: String(useCustomPrefix) });
      } catch (protonErr) {
        const msg = String(protonErr).slice(0, 200);
        logStep(gameId, "proton", msg, "error");
        logEvent(gameId, "play_failed", { reason: "proton_error", error: msg });
        send("error", `Falha ao configurar Proton: ${msg}`, "error");
        return { success: false, error: `Falha ao configurar Proton: ${msg}`, failedStep: "proton" };
      }
    }

    // ── Step 3: Prefix ──
    let resolvedPrefix: string;
    if (env.prefixValid) {
      // Prefixo já válido — usar direto
      resolvedPrefix = env.prefixPath!;
      logStep(gameId, "prefix", `Prefixo já válido: ${resolvedPrefix}`, "done");
      logPlay(gameId, "prefix_resolved", { resolvedPrefix });
    } else {
      try {
        logStep(gameId, "prefix", "Verificando/criando prefixo...", "working");
        const _s3 = Date.now();
        const prefixResult = await ensurePrefix(
          gameId, prefixPath, protonPath, steamAppId, gamePath, libraryPath, send,
        );
        resolvedPrefix = prefixResult.prefixPath;
        logStep(gameId, "prefix", `Prefixo: ${resolvedPrefix}`, "done", { duration_ms: Date.now() - _s3 });
        logPlay(gameId, "prefix_resolved", { resolvedPrefix });
      } catch (prefixErr) {
        const msg = String(prefixErr).slice(0, 200);
        logStep(gameId, "prefix", msg, "error");
        logEvent(gameId, "play_failed", { reason: "prefix_error", error: msg });
        send("error", `Falha ao criar prefixo: ${msg}`, "error");
        return { success: false, error: `Falha ao criar prefixo: ${msg}`, failedStep: "prefix" };
      }
    }

    // ── Step 3b: Bridge prefix to Steam ──
    if (steamAppId && resolvedPrefix) {
      logStep(gameId, "bridge", "Conectando prefixo ao Steam...", "working");
      const _s3b = Date.now();
      try {
        const protonName = protonPath ? path.basename(protonPath) : undefined;
        const bridgeResult = await bridgePrefixToSteam(gameId, resolvedPrefix, steamAppId, protonName);
        if (bridgeResult.success) {
          logStep(gameId, "bridge", "Prefixo conectado ao Steam", "done", { duration_ms: Date.now() - _s3b });
        } else {
          logStep(gameId, "bridge", `Bridge: ${bridgeResult.error || "parcial"}`, "done", { duration_ms: Date.now() - _s3b });
        }
      } catch (bridgeErr) {
        logStep(gameId, "bridge", `Bridge ignorado: ${String(bridgeErr).slice(0, 100)}`, "done", { duration_ms: Date.now() - _s3b });
      }
    }

    // ── Step 4: Configs (DLL overrides + winetricks + registry) ──
    logStep(gameId, "configs", "Aplicando configuracoes do jogo...", "working");
    const _s4 = Date.now();
    const configsResult: ConfigsResult = await applyGameConfigs(gameId, gamePath, resolvedPrefix, protonPath, send, steamAppId, libraryPath);
    logStep(gameId, "configs", configsResult.ok ? "Configuracoes aplicadas e verificadas" : "FALHA na verificacao", configsResult.ok ? "done" : "error", {
      duration_ms: Date.now() - _s4,
      dll_ok: String(configsResult.dllOk),
      registry_ok: String(configsResult.registryOk),
    });
    logPlay(gameId, "configs_applied", { resolvedPrefix, protonPath, ok: String(configsResult.ok) });

    if (!configsResult.ok) {
      const errMsg = `Verificacao falhou: ${configsResult.errors.join("; ")}`;
      logEvent(gameId, "play_blocked", { reason: "configs_verification_failed", errors: configsResult.errors });
      send("error", `BLOQUEADO: ${errMsg}`, "error");
      return { success: false, error: errMsg, failedStep: "dll" };
    }

    // ── Step 5: Frameworks ──
    logStep(gameId, "frameworks", "Verificando frameworks...", "working");
    const _s5f = Date.now();
    const frameworksResult = await ensureGameFrameworks(gameId, gamePath, send);
    logStep(gameId, "frameworks", `Frameworks: ${frameworksResult.installed.length} instalados, ${frameworksResult.skipped.length} existentes`, "done", { duration_ms: Date.now() - _s5f });
    logPlay(gameId, "frameworks", {
      installed: frameworksResult.installed.join(", "),
      skipped: frameworksResult.skipped.join(", "),
      failed: frameworksResult.failed.join(", "),
    });

    // ── Step 5.5: External Tools ──
    logStep(gameId, "tools", "Verificando tools externas...", "working");
    const _s5t = Date.now();
    const toolsResult = await ensureGameExternalTools(gameId, gamePath, send);
    logStep(gameId, "tools", `Tools: ${toolsResult.installed.length} instaladas, ${toolsResult.skipped.length} existentes`, "done", { duration_ms: Date.now() - _s5t });
    logPlay(gameId, "external_tools", {
      installed: toolsResult.installed.join(", "),
      skipped: toolsResult.skipped.join(", "),
      failed: toolsResult.failed.join(", "),
    });

    // ── Step 6: SKSE ──
    logStep(gameId, "skse", "Verificando Script Extender...", "working");
    const _s5 = Date.now();
    const { hasSkse, sksePath } = await ensureSkse(gameId, gamePath, send);
    logStep(gameId, "skse", hasSkse ? `${sksePath} encontrado` : "Sem SKSE", "done", {
      duration_ms: Date.now() - _s5,
      hasSkse: String(hasSkse),
    });
    logPlay(gameId, "skse", { hasSkse: String(hasSkse), sksePath: sksePath || "" });

    // ── Step 7: Deploy mods — SÓ no play do MOD MANAGER (deployMods=true) ──
    // Jogo ≠ mod. A aba Games inicializa apenas o jogo; o deploy de mods é
    // responsabilidade do Mod Manager (que passa deployMods=true). Rodar o
    // deploy por acidente no play da aba Games chegou a apagar o jogo copiado
    // no prefixo (linkAll({}) → removeDeployedLinks destruía os arquivos).
    logStep(gameId, "deploy", deployMods ? "Implantando mods..." : "Verificando mods...", "working");
    const _s6 = Date.now();
    try {
      const modlistKey = `game:${gameId}:profile:${usedProfile}:modlist`;
      const modlist = ModStorageService.get<any[]>(modlistKey) || [];
      const enabledCount = modlist.filter((m: any) => m?.enabled && !m?.isSeparator).length;
      if (!deployMods) {
        // Aba Games: nunca implantar mods na pasta do jogo.
        logPlay(gameId, "deploy", {
          stagingDir: env.stagingDir,
          modlistCount: String(modlist.length),
          enabled: String(enabledCount),
          deployed: "false",
          success: "true",
        });
        logStep(gameId, "deploy", "Aba Games: sem deploy de mods (inicializar jogo apenas)", "done", { duration_ms: Date.now() - _s6 });
        send("deploy", "Aba Games: sem deploy de mods", "done");
      } else if (enabledCount === 0) {
        logPlay(gameId, "deploy", {
          stagingDir: env.stagingDir,
          modlistCount: String(modlist.length),
          enabled: "0",
          success: "true",
        });
        logStep(gameId, "deploy", "Sem mods habilitados — nada a implantar", "done", { duration_ms: Date.now() - _s6 });
        send("deploy", "Sem mods habilitados — nada a implantar", "done");
      } else {
        const deployFn = getDeployFunction(gameId);
        const deployResult = await deployFn(
          gameId, gamePath, env.stagingDir, modlist, usedProfile, resolvedPrefix,
        );
        logPlay(gameId, "deploy", {
          stagingDir: env.stagingDir,
          modlistCount: String(modlist.length),
          enabled: String(enabledCount),
          success: String(deployResult.success),
        });
        if (!deployResult.success) {
          logStep(gameId, "deploy", `Falha: ${deployResult.error || "erro"}`, "error", { duration_ms: Date.now() - _s6 });
          logEvent(gameId, "play_failed", { reason: "deploy_failed", error: deployResult.error });
          send("deploy", `Falha no deploy: ${deployResult.error || "erro desconhecido"}`, "error");
          return { success: false, error: deployResult.error || "Deploy failed", failedStep: "deploy" };
        }
        logStep(gameId, "deploy", `${deployResult.log?.length || 0} operações`, "done", { duration_ms: Date.now() - _s6 });
        send("deploy", `Mods implantados (${deployResult.log?.length || 0} operações)`, "done");
      }
    } catch (deployErr) {
      const msg = String(deployErr).slice(0, 150);
      logStep(gameId, "deploy", msg, "error", { duration_ms: Date.now() - _s6 });
      logEvent(gameId, "play_failed", { reason: "deploy_exception", error: msg });
      send("deploy", msg, "error");
      return { success: false, error: `Falha no deploy: ${msg}`, failedStep: "deploy" };
    }

    // ── Step 8: Launch ──
    logStep(gameId, "launch", "Iniciando jogo...", "working");
    const _s7 = Date.now();
    const launchResult = await launchGame(
      gameId, gamePath, resolvedPrefix, steamAppId, libraryPath,
      hasSkse, sksePath, protonPath, send,
    );
    logStep(gameId, "launch", launchResult.success ? "Jogo iniciado" : "Falha ao iniciar", launchResult.success ? "done" : "error", {
      duration_ms: Date.now() - _s7,
      method: launchResult.method || "",
    });
    logPlay(gameId, "launch", {
      success: String(launchResult.success),
      method: launchResult.method || "",
    });

    const totalMs = Date.now() - _startAll;
    logEvent(gameId, "play_completed", {
      success: launchResult.success,
      method: launchResult.method,
      total_duration_ms: totalMs,
    });

    return {
      success: launchResult.success,
      method: launchResult.method,
      gamePath,
      error: launchResult.error,
      failedStep: launchResult.success ? undefined : "launch",
    };
  } catch (err) {
    const msg = String(err).slice(0, 200);
    const totalMs = Date.now() - _startAll;
    logger.error(`playGame error: ${msg}`);
    logPlay(gameId, "error", { message: msg });
    logStep(gameId, "error", msg, "error", { duration_ms: totalMs });
    logEvent(gameId, "play_failed", { reason: "exception", error: msg, total_duration_ms: totalMs });
    send("error", `Erro interno: ${msg}`, "error");
    return { success: false, error: msg, failedStep: "unknown" };
  }
}
