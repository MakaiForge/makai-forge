import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { getGameInfo } from "@games/registry";
import { getStagingDir, findStagingDir } from "@games/_shared/filemap";
import { undeployMod } from "@mods/services/mod-deploy/core";
import { findAllSteamLibraries } from "@prefix/core/steam-paths";
import { findGogGamePath } from "@mods/services/gog-detection";
import { gameDllCatalog } from "@mods/services/game-dlls-service";
import { detectGame } from "@mods/services/detection";
import { defaultStagingDir, defaultPrefixDir } from "@mods/services/steam-library";
import { checkPrefixHealth, autoFixPrefix } from "@mods/services/health-check";
import { setBridgeContext, getBridgeContext, clearBridgeContext } from "@mods/services/bridge-context";
import { expandHome } from "@mods/services/path-utils";
import { logPlay } from "@game-launcher/play/logger";
import fs from "node:fs";
import path from "node:path";

const mkMlKey = (g: string, p: string) => `game:${g}:profile:${p}:modlist`;

registerEvent("saveGameConfig", async (_event, gameName: string, config: { gamePath: string; stagingDir: string; protonPrefix: string; protonVersion?: string }) => {
  const safeConfig = {
    gamePath: expandHome(config.gamePath),
    stagingDir: expandHome(config.stagingDir),
    protonPrefix: expandHome(config.protonPrefix),
    protonVersion: config.protonVersion || "",
  };
  ModStorageService.put(`game:${gameName}:config`, safeConfig);
  logPlay(gameName, "saveGameConfig", {
    gamePath: safeConfig.gamePath,
    stagingDir: safeConfig.stagingDir,
    protonPrefix: safeConfig.protonPrefix,
    protonVersion: safeConfig.protonVersion,
  });
  return { ok: true };
});

registerEvent("getGameConfig", async (_event, gameName: string) => {
  const cfg = ModStorageService.get(`game:${gameName}:config`) || null;
  logPlay(gameName, "getGameConfig", cfg ? { gamePath: cfg.gamePath, stagingDir: cfg.stagingDir, protonPrefix: cfg.protonPrefix } : {});
  return cfg;
});

registerEvent("removeMod", async (_event, gameId: string, profile: string, modName: string) => {
  const modlistKey = mkMlKey(gameId, profile);
  const existing: any[] = ModStorageService.get(modlistKey) || [];
  const updated = existing.filter((m: any) => m.name !== modName);
  ModStorageService.put(modlistKey, updated);

  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const gamePath = config?.gamePath ? expandHome(config.gamePath) : undefined;
  if (gamePath) {
    await undeployMod(gameId, modName, gamePath);
  }
  return { ok: true };
});

registerEvent("deleteMod", async (_event, gameId: string, profile: string, modName: string) => {
  const modlistKey = mkMlKey(gameId, profile);
  const existing: any[] = ModStorageService.get(modlistKey) || [];
  const updated = existing.filter((m: any) => m.name !== modName);
  ModStorageService.put(modlistKey, updated);

  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const gamePath = config?.gamePath ? expandHome(config.gamePath) : undefined;
  if (gamePath) {
    await undeployMod(gameId, modName, gamePath);
  }

  // Also delete staging files
  const stagingDir = config?.stagingDir ? expandHome(config.stagingDir) : getStagingDir(gameId);
  const modStaging = findStagingDir(stagingDir, modName);
  if (modStaging && fs.existsSync(modStaging)) {
    fs.rmSync(modStaging, { recursive: true, force: true });
  }

  return { ok: true };
});

registerEvent("getModGameInfo", async (_event, gameId: string) => {
  return getGameInfo(gameId);
});

registerEvent("modDetectGamePath", async (_event, gameId: string) => {
  const detected = detectGame(gameId);
  logPlay(gameId, "modDetectGamePath", detected.source ? { source: detected.source, gamePath: detected.gamePath || "", prefixPath: detected.prefixPath || "" } : { source: "not_found" });
  if (detected.source) return { gamePath: detected.gamePath, prefixPath: detected.prefixPath };
  return null;
});

registerEvent("detectGameManual", async (_event, gameId: string, selectedPath: string) => {
  const gameInfo = gameDllCatalog.getGame(gameId);
  if (!gameInfo) {
    logPlay(gameId, "detectGameManual", { error: "jogo_nao_encontrado_catalogo" });
    return { ok: false, error: "Jogo não encontrado no catálogo" };
  }

  const exes = [gameInfo.detectExe, ...(gameInfo.detectExeAlts || [])];
  const foundExe = exes.find((exe) => fs.existsSync(path.join(selectedPath, exe)));
  if (!foundExe) {
    logPlay(gameId, "detectGameManual", { error: "exe_nao_encontrado", selectedPath, exesBuscados: exes.join(",") });
    return { ok: false, error: `Nenhum executável encontrado em ${selectedPath}. Esperado: ${exes.join(" ou ")}` };
  }

  const staging = defaultStagingDir(gameId);
  // Tentar detectar prefix existente antes de usar default
  const detected = detectGame(gameId);
  const prefix = detected.prefixPath || defaultPrefixDir(gameId);
  ModStorageService.put(`game:${gameId}:config`, {
    gamePath: expandHome(selectedPath),
    stagingDir: expandHome(staging),
    protonPrefix: expandHome(prefix),
    protonVersion: "",
  });

  logPlay(gameId, "detectGameManual", { gamePath: selectedPath, stagingDir: staging, prefixDir: prefix, foundExe });

  return { ok: true, data: { gamePath: selectedPath, stagingDir: staging, protonPrefix: prefix } };
});

registerEvent("listGameConfigs", async () => {
  const entries = ModStorageService.entries<any>("game:");
  const configs = entries
    .filter((e) => e.key.endsWith(":config"))
    .map((e) => ({
      name: e.key.slice("game:".length, -":config".length),
      config: e.value,
    }))
    .filter((e) => e.name !== "");
  for (const c of configs) {
    logPlay(c.name, "listGameConfigs", { gamePath: c.config.gamePath, stagingDir: c.config.stagingDir });
  }
  return configs;
});

registerEvent("getGameDllCatalog", async () => {
  return { ok: true, data: gameDllCatalog.getAll() };
});

registerEvent("getGameDllInfo", async (_event, gameId: string) => {
  const entry = gameDllCatalog.getGame(gameId);
  return entry || null;
});

registerEvent("prefixHealthCheck", async (_event, gameId: string) => {
  let config = ModStorageService.get<any>(`game:${gameId}:config`);
  if (!config?.gamePath || !config?.protonPrefix) {
    // Tentar detectar automaticamente antes de dar erro
    const detected = detectGame(gameId);
    if (detected.source && detected.gamePath) {
      config = {
        gamePath: detected.gamePath,
        stagingDir: config?.stagingDir || defaultStagingDir(gameId),
        protonPrefix: detected.prefixPath || config?.protonPrefix || defaultPrefixDir(gameId),
        protonVersion: config?.protonVersion || "",
      };
      ModStorageService.put(`game:${gameId}:config`, config);
    } else {
      logPlay(gameId, "prefixHealthCheck", { error: "jogo_nao_configurado" });
      return { ok: false, error: "Jogo não configurado. Detecte ou configure manualmente primeiro." };
    }
  }
  const report = checkPrefixHealth(gameId, config.gamePath, config.protonPrefix);
  logPlay(gameId, "prefixHealthCheck", {
    gamePath: config.gamePath,
    protonPrefix: config.protonPrefix,
    valid: String(report.valid),
    errors: report.errors.join(","),
  });
  return { ok: true, data: report };
});

registerEvent("prefixAutoFix", async (_event, gameId: string) => {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  if (!config?.gamePath || !config?.protonPrefix) {
    logPlay(gameId, "prefixAutoFix", { error: "jogo_nao_configurado" });
    return { ok: false, error: "Jogo não configurado." };
  }
  const result = await autoFixPrefix(gameId, config.gamePath, config.protonPrefix);
  logPlay(gameId, "prefixAutoFix", { fixed: (result.fixed || []).join(",") });
  return { ok: true, data: result };
});

registerEvent("modBridgeSetContext", async (_event, ctx: { source: string; gameId: string; prefixPath: string; gamePath?: string }) => {
  setBridgeContext(ctx);
  return { ok: true, data: getBridgeContext() };
});

registerEvent("modBridgeGetContext", async () => {
  return { ok: true, data: getBridgeContext() };
});

registerEvent("modBridgeClearContext", async () => {
  clearBridgeContext();
  return { ok: true };
});


