import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { ModStorageService, logger } from "@main/services";
import { getGameInfo, getGameModule } from "@games/registry";
import { scanFixGame } from "./scanfix-game";
import { seedBethesdaRegistry } from "@prefix/core/bethesda-registry";
import { applyWineDllOverrides } from "@prefix/core/dll-overrides";
import { ensurePrefixDir } from "@prefix/core/validate";
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
    send("detect", "🔍 Detectando jogo nas bibliotecas Steam...", "working");

    const scan = await scanFixGame(gameId);
    if (!scan.found || !scan.gamePath) {
      send("detect", "❌ " + (scan.error || "Jogo não encontrado"), "error");
      send("detect", "Configure o caminho manualmente em Configurações do Jogo", "error", "config");
      return { success: false, error: scan.error };
    }
    const gamePath = scan.gamePath;
    send("detect", `✅ Jogo encontrado: ${path.basename(gamePath)}`, "done");

    send("prefix", "🔧 Verificando prefixo Wine...", "working");

    const info = getGameInfo(gameId);
    const steamAppId = info?.steamAppId;
    const config = ModStorageService.get<any>(`game:${gameId}:config`);
    let prefixPath = config?.protonPrefix;

    if (!prefixPath && steamAppId) {
      prefixPath = path.join(
        path.dirname(path.dirname(gamePath)), "compatdata", steamAppId, "pfx"
      );
    }
    if (!prefixPath) {
      send("prefix", "❌ Prefixo não encontrado — configure um Proton primeiro", "error");
      send("prefix", "Vá em Configurações > Proton e configure um Proton para este jogo", "error", "proton");
      return { success: false, error: "No prefix" };
    }

    const pfx = ensurePrefixDir(prefixPath);
    if (!pfx) {
      send("prefix", "❌ Não foi possível criar diretório do prefixo", "error");
      return { success: false, error: "Cannot create prefix dir" };
    }

    const hasSystemReg = fs.existsSync(path.join(pfx, "system.reg"));
    const hasDriveC = fs.existsSync(path.join(pfx, "drive_c"));
    const hasDosDevices = fs.existsSync(path.join(pfx, "dosdevices"));

    if (!hasSystemReg || !hasDriveC || !hasDosDevices) {
      send("prefix",
        "⚠️ Prefixo incompleto (faltam arquivos do Wine). " +
        (hasSystemReg ? "✅ system.reg" : "❌ system.reg") + " " +
        (hasDriveC ? "✅ drive_c" : "❌ drive_c") + " " +
        (hasDosDevices ? "✅ dosdevices" : "❌ dosdevices"),
        "done"
      );
      send("prefix",
        "💡 Configure o Proton novamente para recriar o prefixo completo",
        "info", "config"
      );
    } else {
      send("prefix", "✅ Prefixo válido (system.reg, drive_c, dosdevices ok)", "done");
    }

    send("dll", "📦 Verificando DLL Overrides...", "working");

    const mod = getGameModule(gameId, gamePath);
    const overrides = mod.getWineDllOverrides?.();

    if (overrides && Object.keys(overrides).length > 0) {
      const dllList = Object.keys(overrides);
      send("dll", `Aplicando ${dllList.length} DLL overrides: ${dllList.join(", ")}`, "working");
      applyWineDllOverrides(prefixPath, overrides);
      send("dll", `✅ ${dllList.length} DLL overrides aplicados em user.reg`, "done");
    } else {
      send("dll", "✅ Nenhum DLL override necessário para este jogo", "done");
    }

    send("registry", "🏛️ Verificando registro Bethesda...", "working");

    if (mod.bethesdaRegistryName) {
      const ok = seedBethesdaRegistry(prefixPath, gamePath, mod.bethesdaRegistryName);
      send("registry",
        ok
          ? `✅ Registro Bethesda (${mod.bethesdaRegistryName}) configurado em system.reg`
          : `⚠️ Falha ao configurar registro Bethesda (${mod.bethesdaRegistryName})`,
        "done"
      );
    } else {
      send("registry", "⏭️ Jogo não-Bethesda, pulando registro", "done");
    }

    send("skse", "🔍 Verificando script extender...", "working");

    const skseLoaderName = mod.getScriptExtenderRelease?.()?.loaderName || "skse64_loader.exe";
    const sksePath = path.join(gamePath, skseLoaderName);
    const skseExists = fs.existsSync(sksePath);

    if (skseExists) {
      send("skse", `✅ ${skseLoaderName} encontrado`, "done");
    } else {
      send("skse", `⬇️ Baixando ${skseLoaderName}...`, "working");
      try {
        const ok = await downloadSkse(gameId, gamePath);
        if (ok) {
          send("skse", `✅ ${skseLoaderName} baixado e instalado`, "done");
        } else {
          send("skse", `⚠️ Falha ao baixar ${skseLoaderName}. Jogo iniciará sem ele.`, "done");
        }
      } catch (err) {
        send("skse", `⚠️ Erro: ${String(err).slice(0, 80)}. Jogo iniciará sem SKSE.`, "done");
      }
    }

    const hasSkse = fs.existsSync(sksePath);

    send("launch", "🚀 Iniciando jogo...", "working");

    if (hasSkse) {
      send("launch", `🚀 Iniciando via ${skseLoaderName}...`, "working");
      const env = getSteamLaunchEnv(steamAppId, gamePath, prefixPath);
      const gameProtonPath = config?.protonVersion;
      const globalProtonPath = ModStorageService.get<string>("proton_binary");
      const protonPath = gameProtonPath || globalProtonPath || path.join(app.getAppPath(), "tools", "prefix", "umu-run");
      launchViaProton(sksePath, protonPath, env);
      send("launch", `✅ ${info?.name || gameId} iniciado!`, "done");
      return { success: true, method: "skse" };
    }

    if (steamAppId) {
      send("launch", "🚀 Iniciando via Steam...", "working");
      launchViaSteam(steamAppId);
      send("launch", `✅ ${info?.name || gameId} iniciado via Steam!`, "done");
      return { success: true, method: "steam" };
    }

    const exeName = mod.exeName || info?.exeName || "";
    if (exeName) {
      const exePath = path.join(gamePath, exeName);
      if (fs.existsSync(exePath)) {
        send("launch", `🚀 Iniciando ${exeName} diretamente via Proton...`, "working");
        const env = getSteamLaunchEnv(undefined, gamePath, prefixPath);
        const gameProtonPath = config?.protonVersion;
        const globalProtonPath = ModStorageService.get<string>("proton_binary");
        const protonPath = gameProtonPath || globalProtonPath || path.join(app.getAppPath(), "tools", "prefix", "umu-run");
        launchViaProton(exePath, protonPath, env);
        send("launch", `✅ ${info?.name || gameId} iniciado!`, "done");
        return { success: true, method: "direct" };
      }
    }

    send("launch", "❌ Nenhum método de launch disponível", "error");
    return { success: false, error: "No launch method" };

  } catch (err) {
    const msg = String(err).slice(0, 200);
    logger.error(`launchGame error: ${msg}`);
    send("launch", `❌ Erro interno: ${msg}`, "error");
    return { success: false, error: msg };
  }
}
