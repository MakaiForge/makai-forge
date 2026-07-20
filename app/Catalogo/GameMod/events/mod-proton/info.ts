import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { findSteamAppIdFromGamePath, findCompatibilityToolPath } from "./helpers";

registerEvent("getGameProtonInfo", async (event, gameName: string) => {
  const sendProgress = (step: string, status: string) => {
    try { event.sender.send("proton-info-progress", { step, status }); } catch {}
  };

  const { ProtonfixService } = await import("@main/services/protonfix-service");
  const { ProtonRecommendationService } = await import("@provision/proton_recommended/services/proton-recommendation");
  const { getSteamLocation } = await import("@main/services/steam");
  const { getSteamGameProton } = await import("@main/services/steam-config-vdf");
  const fs = await import("node:fs");
  const p = await import("node:path");

  const result: {
    appId: string | null;
    currentProton: { name: string; priority: string } | null;
    recommendation: any | null;
    installedForks: any[];
    recommendedDlls: any | null;
    prefixPath: string | null;
    steamPath: string | null;
    protonPath: string | null;
    compatInfo: any | null;
    error: string | null;
    status: string;
  } = {
    appId: null, currentProton: null, recommendation: null,
    installedForks: [], recommendedDlls: null,
    prefixPath: null, steamPath: null, protonPath: null,
    compatInfo: null, error: null, status: "",
  };

  try {
    sendProgress("steam", "Procurando diretório da Steam...");
    result.status = "Procurando diretório da Steam...";
    const steamPath = await getSteamLocation().catch(() => null);
    result.steamPath = steamPath;
    if (!steamPath) {
      result.status = "Steam não encontrada.";
      return result;
    }

    sendProgress("config", "Carregando configuração do jogo...");
    result.status = "Carregando configuração do jogo...";
    const config = ModStorageService.get<any>(`game:${gameName}:config`);
    const gamePath: string | undefined = config?.gamePath;

    sendProgress("appid", "Detectando App ID do jogo...");
    result.status = "Detectando App ID do jogo...";

    let appId: string | null = null;

    if (gamePath && steamPath) {
      appId = await findSteamAppIdFromGamePath(gamePath, steamPath, fs, p);
    }

    if (!appId) {
      appId = ProtonfixService.getGameAppId(gameName);
      result.compatInfo = ProtonfixService.getGameCompatInfo(gameName);
    }

    result.appId = appId;

    sendProgress("prefix", "Localizando prefixo Proton...");
    result.status = "Localizando prefixo Proton...";

    if (appId && steamPath) {
      result.currentProton = await getSteamGameProton(appId);

      const libraryPaths: string[] = [steamPath];
      const libraryFoldersPath = p.join(steamPath, "steamapps", "libraryfolders.vdf");
      if (fs.existsSync(libraryFoldersPath)) {
        try {
          const vdfRaw = fs.readFileSync(libraryFoldersPath, "utf-8");
          const libMatch = vdfRaw.match(/"\d+"\s*\{[^}]*?"path"\s*"([^"]+)"/g);
          if (libMatch) {
            for (const entry of libMatch) {
              const pathMatch = entry.match(/"path"\s*"([^"]+)"/);
              if (pathMatch && fs.existsSync(pathMatch[1])) libraryPaths.push(pathMatch[1]);
            }
          }
        } catch {}
      }

      for (const libPath of libraryPaths) {
        const compatdataPfx = p.join(libPath, "steamapps", "compatdata", appId, "pfx");
        if (fs.existsSync(compatdataPfx)) {
          result.prefixPath = compatdataPfx;
          break;
        }
      }
      if (!result.prefixPath) {
        result.prefixPath = p.join(steamPath, "compatdata", appId, "pfx");
      }
    }

    sendProgress("proton", "Detectando caminho do Proton...");
    result.status = "Detectando caminho do Proton...";

    if (result.currentProton?.name && result.steamPath) {
      const foundPath = findCompatibilityToolPath(result.currentProton.name, result.steamPath, fs, p);
      if (foundPath) {
        result.protonPath = foundPath;
      }
    }

    if (!result.protonPath && result.compatInfo?.proton && result.steamPath) {
      const foundPath = findCompatibilityToolPath(result.compatInfo.proton, result.steamPath, fs, p);
      if (foundPath) {
        result.protonPath = foundPath;
      }
    }

    sendProgress("api", "Consultando recomendações da API...");
    result.status = "Consultando recomendações da API...";

    await Promise.allSettled([
      ProtonRecommendationService.recommend(gameName).then(r => { result.recommendation = r; }).catch(() => {}),
      ProtonRecommendationService.getInstalledForks().then(f => { result.installedForks = f; }).catch(() => {}),
      ProtonRecommendationService.getRecommendedDlls(gameName).then(d => { result.recommendedDlls = d; }).catch(() => {}),
    ]);

    result.status = appId ? "Pronto. Prefixo detectado automaticamente." : "Pronto. Jogo não encontrado na Steam.";
  } catch (err) {
    result.error = String(err);
    result.status = `Erro: ${String(err).slice(0, 100)}`;
  }

  return result;
});
