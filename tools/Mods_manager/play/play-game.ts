import fs from "node:fs";
import path from "node:path";
import { ModStorageService, logger } from "@main/services";
import { getDeployFunction } from "@games/registry";
import { getStagingDir } from "@games/_shared/filemap";
import { detectGame, defaultPrefixDir } from "./steps/01-detect";
import { ensureProton } from "./steps/02-proton";
import { ensurePrefix } from "./steps/03-prefix";
import { applyGameConfigs } from "./steps/04-configs";
import { ensureSkse } from "./steps/05-skse";
import { launchGame } from "./steps/06-launch";
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
      return detect;
    }
    logStep(gameId, "detect", "Jogo detectado", "done", { duration_ms: Date.now() - _s1 });

    const { gamePath, steamAppId, prefixPath, libraryPath } = detect as DetectResult;
    logPlay(gameId, "detect", {
      gamePath: gamePath || "",
      steamAppId: steamAppId || "",
      prefixPath: prefixPath || "",
      libraryPath: libraryPath || "",
    });

    // Determine effective prefix (respect configured prefix if it already exists)
    let effectivePrefix = prefixPath;
    const configuredPfxExists = prefixPath && fs.existsSync(path.join(prefixPath, "user.reg"));
    if (!configuredPfxExists && steamAppId && libraryPath) {
      const steamPfx = path.join(libraryPath, "compatdata", steamAppId, "pfx");
      if (fs.existsSync(steamPfx) && fs.existsSync(path.join(steamPfx, "drive_c"))) {
        effectivePrefix = steamPfx;
      }
    }
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
    const finalPrefixPath = useCustomPrefix ? defaultPrefixDir(gameId) : prefixPath;
    const { prefixPath: resolvedPrefix } = await ensurePrefix(
      gameId, finalPrefixPath, protonPath, steamAppId, gamePath, libraryPath, send,
    );
    logStep(gameId, "prefix", `Prefixo: ${resolvedPrefix}`, "done", { duration_ms: Date.now() - _s3 });
    logPlay(gameId, "prefix_resolved", { resolvedPrefix: resolvedPrefix || "" });

    // ── Step 4: Configs (DLL overrides + winetricks + registry) ──
    logStep(gameId, "configs", "Aplicando configurações do jogo...", "working");
    const _s4 = Date.now();
    await applyGameConfigs(gameId, gamePath, resolvedPrefix, protonPath, send, steamAppId, libraryPath);
    logStep(gameId, "configs", "Configurações aplicadas", "done", { duration_ms: Date.now() - _s4 });
    logPlay(gameId, "configs_applied", { resolvedPrefix, protonPath });

    // ── Step 5: SKSE (antes do deploy para o swap do launcher funcionar) ──
    logStep(gameId, "skse", "Verificando Script Extender...", "working");
    const _s5 = Date.now();
    const { hasSkse, sksePath } = await ensureSkse(gameId, gamePath, send);
    logStep(gameId, "skse", hasSkse ? `${sksePath} encontrado` : "Sem SKSE", "done", {
      duration_ms: Date.now() - _s5,
      hasSkse: String(hasSkse),
    });
    logPlay(gameId, "skse", { hasSkse: String(hasSkse), sksePath: sksePath || "" });

    // ── Step 6: Deploy mods ──
    logStep(gameId, "deploy", "Implantando mods...", "working");
    const _s6 = Date.now();
    try {
      const config = ModStorageService.get<any>(`game:${gameId}:config`);
      const stagingDir = config?.stagingDir || getStagingDir(gameId);
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
        return { success: false, error: deployResult.error || "Deploy failed" };
      }
      logStep(gameId, "deploy", `${deployResult.log?.length || 0} operações`, "done", { duration_ms: Date.now() - _s6 });
      send("deploy", `Mods implantados (${deployResult.log?.length || 0} operações)`, "done");
    } catch (deployErr) {
      const msg = String(deployErr).slice(0, 150);
      logStep(gameId, "deploy", msg, "error", { duration_ms: Date.now() - _s6 });
      logEvent(gameId, "play_failed", { reason: "deploy_exception", error: msg });
      send("deploy", msg, "error");
      throw new Error(`Falha no deploy: ${msg}`);
    }

    // ── Step 7: Launch ──
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
    return { success: false, error: msg };
  }
}
