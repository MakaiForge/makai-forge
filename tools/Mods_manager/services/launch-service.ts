import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { app } from "electron";
import { ModStorageService, logger } from "@main/services";
import { getGameModule, getGameInfo } from "@games/registry";
import { scanEnvironment } from "./environment-scanner";
import { launchViaSteam, launchViaProton, getSteamLaunchEnv, findSteamCompatData } from "@games/_shared/launch";
import { downloadSkse } from "./skse-downloader";

export type LaunchStep = "detect" | "prefix" | "dll" | "registry" | "skse" | "launch";
export type LaunchStatus = "working" | "done" | "error" | "info";

export interface LaunchProgress {
  step: LaunchStep;
  message: string;
  status: LaunchStatus;
  promptType?: string;
}

export interface LaunchResult {
  success: boolean;
  method?: string;
  error?: string;
}

export async function launchGame(
  gameId: string,
  onProgress: (progress: LaunchProgress) => void
): Promise<LaunchResult> {
  const send = (step: LaunchStep, message: string, status: LaunchStatus, promptType?: string) => {
    onProgress({ step, message, status, promptType });
  };

  try {
    // ── Step 0: Scan environment (autoFix: true — corrige DLL overrides, registry, nested pfx) ──
    send("detect", "Verificando ambiente...", "working");
    const env = scanEnvironment({ gameId, autoFix: true });

    if (!env.gamePath) {
      send("detect", env.errors[0] || "Jogo não encontrado", "error");
      send("detect", "Configure o caminho manualmente em Configurações do Jogo", "error", "config");
      return { success: false, error: env.errors[0] || "Game not found" };
    }
    send("detect", `Jogo encontrado: ${path.basename(env.gamePath)}`, "done");

    // ── Report what scanner fixed ──
    if (env.fixed.length > 0) {
      for (const fix of env.fixed) {
        send("dll", fix, "done");
      }
    }

    // ── Step 1: Prefix ──
    send("prefix", "Verificando prefixo Wine...", "working");

    if (!env.prefixPath) {
      send("prefix", "Prefixo não encontrado — configure um Proton primeiro", "error");
      send("prefix", "Vá em Configurações > Proton e configure um Proton para este jogo", "error", "proton");
      return { success: false, error: "No prefix" };
    }

    if (!env.prefixValid) {
      send("prefix",
        "Prefixo incompleto (faltam arquivos do Wine). Configure o Proton novamente para recriar.",
        "done", "config"
      );
    } else {
      send("prefix", `Prefixo válido: ${env.prefixPath}`, "done");
    }

    // ── Step 2: DLL Overrides (scanner já aplicou se autoFix) ──
    send("dll", "Verificando DLL Overrides...", "working");
    const mod = getGameModule(gameId, env.gamePath);
    const overrides = mod.getWineDllOverrides?.();
    if (overrides && Object.keys(overrides).length > 0) {
      send("dll",
        env.dllOverridesOk
          ? `${Object.keys(overrides).length} DLL overrides já configurados`
          : `DLL overrides precisam de atenção`,
        env.dllOverridesOk ? "done" : "error"
      );
    } else {
      send("dll", "Nenhum DLL override necessário para este jogo", "done");
    }

    // ── Step 3: Registry (scanner já aplicou se autoFix) ──
    send("registry", "Verificando registro Bethesda...", "working");
    if (mod.bethesdaRegistryName) {
      send("registry",
        env.registryOk
          ? `Registro Bethesda (${mod.bethesdaRegistryName}) já configurado`
          : `Registro Bethesda (${mod.bethesdaRegistryName}) precisa de atenção`,
        env.registryOk ? "done" : "error"
      );
    } else {
      send("registry", "Jogo não-Bethesda, pulando registro", "done");
    }

    // ── Step 4: SKSE (lento — scanner não baixa) ──
    send("skse", "Verificando script extender...", "working");

    const skseLoaderName = mod.getScriptExtenderRelease?.()?.loaderName || "skse64_loader.exe";
    let hasSkse = env.skseInstalled;

    if (!hasSkse) {
      send("skse", `Baixando ${skseLoaderName}...`, "working");
      try {
        const ok = await downloadSkse(gameId, env.gamePath);
        hasSkse = ok;
        send("skse", ok ? `${skseLoaderName} baixado e instalado` : `Falha ao baixar ${skseLoaderName}. Jogo iniciará sem ele.`, "done");
      } catch (err) {
        send("skse", `Erro: ${String(err).slice(0, 80)}. Jogo iniciará sem SKSE.`, "done");
      }
    } else {
      send("skse", `${skseLoaderName} encontrado`, "done");
    }

    // ── Step 5: Launch ──
    send("launch", "Iniciando jogo...", "working");

    const info = getGameInfo(gameId);

    if (hasSkse) {
      send("launch", `Iniciando via ${skseLoaderName}...`, "working");
      const sksePath = path.join(env.gamePath, skseLoaderName);
      const gameDir = path.dirname(sksePath);
      const compatDataPath = env.steamAppId ? findSteamCompatData(env.gamePath, env.steamAppId) : null;
      const launchPrefix = compatDataPath ? compatDataPath + "/pfx" : env.prefixPath;
      const protonDir = env.protonPath || "";
      const bundledUmu = path.join(app.getAppPath(), "tools", "prefix", "umu-run");
      const umuBin = fs.existsSync(bundledUmu) ? bundledUmu : "umu-run";
      const launchEnv: Record<string, string> = {
        WINEPREFIX: launchPrefix,
        SteamAppId: env.steamAppId || "",
        STEAM_COMPAT_DATA_PATH: compatDataPath || launchPrefix,
        STEAM_COMPAT_INSTALL_PATH: env.gamePath,
        GAMEID: env.steamAppId ? `umu-${env.steamAppId}` : "",
        STORE: "steam",
        PROTONPATH: protonDir,
      };
      spawn(umuBin, [sksePath], {
        cwd: gameDir,
        env: { ...process.env, ...launchEnv },
        stdio: "ignore",
        detached: true,
      }).unref();
      send("launch", `${info?.name || gameId} iniciado!`, "done");
      return { success: true, method: "skse" };
    }

    if (env.steamAppId) {
      send("launch", "Iniciando via Steam...", "working");
      launchViaSteam(env.steamAppId);
      send("launch", `${info?.name || gameId} iniciado via Steam!`, "done");
      return { success: true, method: "steam" };
    }

    const exeName = mod.exeName || info?.exeName || "";
    if (exeName) {
      const exePath = path.join(env.gamePath, exeName);
      const fs = await import("node:fs");
      if (fs.default.existsSync(exePath)) {
        send("launch", `Iniciando ${exeName} diretamente via Proton...`, "working");
        const env2 = getSteamLaunchEnv(undefined, env.gamePath, env.prefixPath);
        const protonPath = env.protonPath || path.join(app.getAppPath(), "tools", "prefix", "umu-run");
        launchViaProton(exePath, protonPath, env2);
        send("launch", `${info?.name || gameId} iniciado!`, "done");
        return { success: true, method: "direct" };
      }
    }

    send("launch", "Nenhum método de launch disponível", "error");
    return { success: false, error: "No launch method" };

  } catch (err) {
    const msg = String(err).slice(0, 200);
    logger.error(`launchGame error: ${msg}`);
    send("launch", `Erro interno: ${msg}`, "error");
    return { success: false, error: msg };
  }
}
