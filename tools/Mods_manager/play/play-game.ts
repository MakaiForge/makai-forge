import os from "node:os";
import path from "node:path";
import { ModStorageService, logger } from "@main/services";
import { getDeployFunction } from "@games/registry";
import { getStagingDir } from "@games/_shared/filemap";
import { detectGame } from "./steps/01-detect";
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
import type { DetectResult } from "./steps/01-detect";
import { logPlay } from "./logger";
import { logStep, logEvent, resetStepCounter } from "./activity-logger";

export async function playGame(
  gameId: string,
  send: SendProgress,
  profile?: string,
): Promise<PlayResult> {
  const _startAll = Date.now();
  resetStepCounter();
  logEvent(gameId, "play_started", { profile: profile || "Default" });

  try {
    const usedProfile = profile || "Default";
    logPlay(gameId, "start", { profile: usedProfile });

    // ── Step 1: Detect ──
    logStep(gameId, "detect", "Iniciando detecção do jogo...", "working");
    const _s1 = Date.now();
    const detect = await detectGame(gameId, send);
    if (!("gamePath" in detect)) {
      logStep(gameId, "detect", "Jogo não encontrado", "error", { duration_ms: Date.now() - _s1 });
      logEvent(gameId, "play_failed", { reason: "game_not_found" });
      return { ...detect, failedStep: "detect" };
    }
    logStep(gameId, "detect", "Jogo detectado", "done", { duration_ms: Date.now() - _s1 });

    const { gamePath, steamAppId, prefixPath, libraryPath } = detect as DetectResult;
    logPlay(gameId, "detect", {
      gamePath: gamePath || "",
      steamAppId: steamAppId || "",
      prefixPath: prefixPath || "",
      libraryPath: libraryPath || "",
    });

    // Always use the configured prefix — never fall back to Steam compatdata.
    // The user configured this prefix in "Configurar Jogo" and expects mods to be deployed there.
    const effectivePrefix = prefixPath;
    logPlay(gameId, "prefix_effective", { effectivePrefix: effectivePrefix || "" });

    // ── Step 2: Proton ──
    logStep(gameId, "proton", "Verificando Proton...", "working");
    const _s2 = Date.now();
    const { protonPath, useCustomPrefix } = await ensureProton(gameId, send, effectivePrefix);
    logStep(gameId, "proton", `Proton: ${protonPath}`, "done", {
      duration_ms: Date.now() - _s2,
      useCustomPrefix: String(useCustomPrefix),
    });
    logPlay(gameId, "proton", {
      protonPath: protonPath || "",
      useCustomPrefix: String(useCustomPrefix),
    });

    // ── Step 3: Prefix ──
    logStep(gameId, "prefix", "Verificando/criando prefixo...", "working");
    const _s3 = Date.now();
    const finalPrefixPath = prefixPath;
    const { prefixPath: resolvedPrefix } = await ensurePrefix(
      gameId, finalPrefixPath, protonPath, steamAppId, gamePath, libraryPath, send,
    );
    logStep(gameId, "prefix", `Prefixo: ${resolvedPrefix}`, "done", { duration_ms: Date.now() - _s3 });
    logPlay(gameId, "prefix_resolved", { resolvedPrefix: resolvedPrefix || "" });

    // ── Step 3b: Bridge prefix to Steam (symlink compatdata + config.vdf) ──
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

    // Block launch if DLL overrides or registry failed
    if (!configsResult.ok) {
      const errMsg = `Verificacao falhou: ${configsResult.errors.join("; ")}`;
      logEvent(gameId, "play_blocked", { reason: "configs_verification_failed", errors: configsResult.errors });
      send("error", `BLOQUEADO: ${errMsg}`, "error");
      return { success: false, error: errMsg, failedStep: "dll" };
    }

    // ── Step 5: Frameworks (BepInEx, SMAPI, CET, etc.) ──
    logStep(gameId, "frameworks", "Verificando frameworks...", "working");
    const _s5f = Date.now();
    const frameworksResult = await ensureGameFrameworks(gameId, gamePath, send);
    logStep(gameId, "frameworks", `Frameworks: ${frameworksResult.installed.length} instalados, ${frameworksResult.skipped.length} existentes`, "done", { duration_ms: Date.now() - _s5f });
    logPlay(gameId, "frameworks", {
      installed: frameworksResult.installed.join(", "),
      skipped: frameworksResult.skipped.join(", "),
      failed: frameworksResult.failed.join(", "),
    });

    // ── Step 5.5: External Tools (LOOT, xEdit, etc.) ──
    logStep(gameId, "tools", "Verificando tools externas...", "working");
    const _s5t = Date.now();
    const toolsResult = await ensureGameExternalTools(gameId, gamePath, send);
    logStep(gameId, "tools", `Tools: ${toolsResult.installed.length} instaladas, ${toolsResult.skipped.length} existentes`, "done", { duration_ms: Date.now() - _s5t });
    logPlay(gameId, "external_tools", {
      installed: toolsResult.installed.join(", "),
      skipped: toolsResult.skipped.join(", "),
      failed: toolsResult.failed.join(", "),
    });

    // ── Step 6: SKSE (antes do deploy para o swap do launcher funcionar) ──
    logStep(gameId, "skse", "Verificando Script Extender...", "working");
    const _s5 = Date.now();
    const { hasSkse, sksePath } = await ensureSkse(gameId, gamePath, send);
    logStep(gameId, "skse", hasSkse ? `${sksePath} encontrado` : "Sem SKSE", "done", {
      duration_ms: Date.now() - _s5,
      hasSkse: String(hasSkse),
    });
    logPlay(gameId, "skse", { hasSkse: String(hasSkse), sksePath: sksePath || "" });

    // ── Step 7: Deploy mods ──
    logStep(gameId, "deploy", "Implantando mods...", "working");
    const _s6 = Date.now();
    try {
      const config = ModStorageService.get<any>(`game:${gameId}:config`);
      const rawStaging = config?.stagingDir || getStagingDir(gameId);
      const stagingDir = rawStaging.startsWith("~") ? rawStaging.replace("~", os.homedir()) : rawStaging;
      const modlistKey = `game:${gameId}:profile:${usedProfile}:modlist`;
      const modlist = ModStorageService.get<any[]>(modlistKey) || [];
      const deployFn = getDeployFunction(gameId);
      const deployResult = await deployFn(
        gameId, gamePath, stagingDir, modlist, usedProfile, resolvedPrefix,
      );
      logPlay(gameId, "deploy", {
        stagingDir,
        modlistCount: String(modlist.length),
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

    return { success: launchResult.success, method: launchResult.method, gamePath };
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
