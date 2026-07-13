import path from "node:path";
import { app } from "electron";
import { ModStorageService, logger } from "@main/services";
import { getGameModule, getGameInfo } from "@games/registry";
import { scanEnvironment } from "./environment-scanner";
import { seedBethesdaRegistry } from "@prefix/core/bethesda-registry";
import { applyWineDllOverrides } from "@prefix/core/dll-overrides";
import { launchViaSteam, launchViaProton, getSteamLaunchEnv } from "@games/_shared/launch";
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
    // ── Step 0: Scan environment ──
    send("detect", "Verificando ambiente...", "working");
    const env = scanEnvironment({ gameId });

    if (!env.gamePath) {
      send("detect", env.errors[0] || "Jogo não encontrado", "error");
      send("detect", "Configure o caminho manualmente em Configurações do Jogo", "error", "config");
      return { success: false, error: env.errors[0] || "Game not found" };
    }
    send("detect", `Jogo encontrado: ${path.basename(env.gamePath)}`, "done");

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

    // ── Step 2: DLL Overrides ──
    send("dll", "Verificando DLL Overrides...", "working");

    const mod = getGameModule(gameId, env.gamePath);
    const overrides = mod.getWineDllOverrides?.();

    if (overrides && Object.keys(overrides).length > 0) {
      const dllList = Object.keys(overrides);
      if (!env.dllOverridesOk) {
        send("dll", `Aplicando ${dllList.length} DLL overrides: ${dllList.join(", ")}`, "working");
        applyWineDllOverrides(env.prefixPath, overrides);
        send("dll", `${dllList.length} DLL overrides aplicados em user.reg`, "done");
      } else {
        send("dll", `${dllList.length} DLL overrides já configurados`, "done");
      }
    } else {
      send("dll", "Nenhum DLL override necessário para este jogo", "done");
    }

    // ── Step 3: Registry ──
    send("registry", "Verificando registro Bethesda...", "working");

    if (mod.bethesdaRegistryName) {
      if (!env.registryOk) {
        const ok = seedBethesdaRegistry(env.prefixPath, env.gamePath, mod.bethesdaRegistryName);
        send("registry",
          ok
            ? `Registro Bethesda (${mod.bethesdaRegistryName}) configurado em system.reg`
            : `Falha ao configurar registro Bethesda (${mod.bethesdaRegistryName})`,
          "done"
        );
      } else {
        send("registry", `Registro Bethesda (${mod.bethesdaRegistryName}) já configurado`, "done");
      }
    } else {
      send("registry", "Jogo não-Bethesda, pulando registro", "done");
    }

    // ── Step 4: SKSE ──
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
    const config = ModStorageService.get<any>(`game:${gameId}:config`);

    if (hasSkse) {
      send("launch", `Iniciando via ${skseLoaderName}...`, "working");
      const sksePath = path.join(env.gamePath, skseLoaderName);
      const env2 = getSteamLaunchEnv(env.steamAppId, env.gamePath, env.prefixPath);
      const protonPath = env.protonPath || path.join(app.getAppPath(), "tools", "prefix", "umu-run");
      launchViaProton(sksePath, protonPath, env2);
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
