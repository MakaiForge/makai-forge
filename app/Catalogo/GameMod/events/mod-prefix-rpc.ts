import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { createPrefix } from "@container/core/init";
import { logPlay } from "@game-launcher/play/logger";
import { gameDllCatalog } from "../services/game-dlls-service";

type ModGameConfig = {
  gamePath: string;
  stagingDir: string;
  protonPrefix: string;
  protonVersion?: string;
};

/** Procura qualquer Proton instalado no sistema. */
function findAnyProton(): string | null {
  // 1. Steam common/Proton*
  const steamRoots = [
    path.join(os.homedir(), ".local", "share", "Steam"),
    path.join(os.homedir(), ".steam", "steam"),
    "/usr/share/steam",
  ];
  for (const root of steamRoots) {
    const commonDir = path.join(root, "steamapps", "common");
    if (!fs.existsSync(commonDir)) continue;
    try {
      for (const entry of fs.readdirSync(commonDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith("Proton") || entry.name.startsWith("proton")) {
          const protonDir = path.join(commonDir, entry.name);
          if (fs.existsSync(path.join(protonDir, "proton"))) return protonDir;
        }
      }
    } catch { continue; }
  }

  // 2. compatibilitytools.d
  const compatDirs = [
    path.join(os.homedir(), ".steam", "steam", "compatibilitytools.d"),
    "/usr/share/steam/compatibilitytools.d",
  ];
  for (const compatDir of compatDirs) {
    if (!fs.existsSync(compatDir)) continue;
    try {
      for (const entry of fs.readdirSync(compatDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const protonBin = path.join(compatDir, entry.name, "proton");
        if (fs.existsSync(protonBin)) return path.dirname(protonBin);
      }
    } catch { continue; }
  }

  return null;
}

// Mapeamento de autoInstallDeps (catalogo) para verbs do Makaitricks
const DEP_TO_VERB: Record<string, string> = {
  vcredist: "vcrun2022",
  d3dcompiler_47: "d3dcompiler_47",
  dxvk: "dxvk",
};

// Verbs de mídia recomendados para jogos com cutscenes em vídeo
const MEDIA_VERBS = ["mf", "lavfilters"];
// Jogos conhecidos que usam vídeos BINK/outros codecs
const GAMES_WITH_VIDEO = new Set([
  "skyrim", "skyrim_se", "fallout4", "fallout_new_vegas", "oblivion",
  "witcher3", "cyberpunk2077", "resident_evil_village", "hogwarts_legacy",
  "elden_ring", "kingdom_come_deliverance", "starfield", "red_dead_redemption2",
]);

function getVerbsForGame(gameId: string): string[] {
  const verbs: string[] = [];
  const gameInfo = gameDllCatalog.getGame(gameId);
  if (gameInfo?.autoInstallDeps) {
    for (const dep of gameInfo.autoInstallDeps) {
      const verb = DEP_TO_VERB[dep];
      if (verb) verbs.push(verb);
    }
  }
  if (gameInfo?.winetricksComponents?.length) {
    verbs.push(...gameInfo.winetricksComponents);
  }
  if (GAMES_WITH_VIDEO.has(gameId)) {
    verbs.push(...MEDIA_VERBS);
  }
  return [...new Set(verbs)];
}

registerEvent("modCreatePrefix", async (_event, gameId: string) => {
  const config = ModStorageService.get<ModGameConfig | null>(`game:${gameId}:config`);
  if (!config) {
    logPlay(gameId, "modCreatePrefix", { error: "jogo_nao_configurado" });
    return { ok: false, error: "Jogo não configurado. Detecte ou configure manualmente primeiro." };
  }

  let protonPath = config.protonVersion || "";

  // Se não tem Proton configurado, auto-detecta
  if (!protonPath) {
    logPlay(gameId, "modCreatePrefix", { status: "auto-detectando_proton" });
    const found = findAnyProton();
    if (found) {
      protonPath = found;
      // Salva no config pra não precisar detectar de novo
      ModStorageService.put(`game:${gameId}:config`, { ...config, protonVersion: protonPath });
      logPlay(gameId, "modCreatePrefix", { status: "proton_detectado", protonPath });
    } else {
      logPlay(gameId, "modCreatePrefix", { error: "nenhum_proton_encontrado" });
      return { ok: false, error: "Nenhum Proton encontrado no sistema. Instale um Proton pelo Steam primeiro." };
    }
  }

  let prefixPath = config.protonPrefix || "";

  // Se prefixo não configurado, gera path default e salva no config
  if (!prefixPath) {
    prefixPath = path.join(os.homedir(), "Games", "Prefix", gameId);
    logPlay(gameId, "modCreatePrefix", { status: "prefix_gerado_default", prefixPath });
    ModStorageService.put(`game:${gameId}:config`, { ...config, protonPrefix: prefixPath });
  }

  // Monta lista de verbs Makaitricks para este jogo
  const extraVerbs = getVerbsForGame(gameId);
  logPlay(gameId, "modCreatePrefix", { protonPath, prefixPath, gamePath: config.gamePath, extraVerbs: extraVerbs.join(",") });

  const prefixResult = await createPrefix({
    protonPath,
    prefixPath,
    gameId,
    timeout: 120000,
  });

  let dllsInstalled: string[] = [];

  if (prefixResult.success && extraVerbs.length > 0) {
    try {
      const dllResult = await MakaiRPC.call<{ installed: string[]; errors: string[] }>(
        "install_game_dlls",
        { game_id: gameId, prefix_path: prefixPath, proton_path: protonPath, extra_verbs: extraVerbs },
      );
      dllsInstalled = dllResult.installed || [];
    } catch (err) {
      logPlay(gameId, "modCreatePrefix_dlls_error", { error: String(err).slice(0, 200) });
    }
  }

  logPlay(gameId, "modCreatePrefix_result", {
    success: String(prefixResult.success),
    prefix_path: prefixPath,
    initialized: prefixResult.success,
    dlls: dllsInstalled.join(","),
    error: prefixResult.error || "",
  });

  return {
    ok: prefixResult.success,
    data: {
      prefixPath,
      initialized: prefixResult.success,
      dllsInstalled,
      errors: prefixResult.error ? [prefixResult.error] : [],
    },
    error: prefixResult.success ? undefined : (prefixResult.error || "Falha ao criar prefixo"),
  };
});

registerEvent("modInstallGameDlls", async (_event, gameId: string, extraVerbs?: string[]) => {
  const config = ModStorageService.get<ModGameConfig | null>(`game:${gameId}:config`);
  if (!config) {
    logPlay(gameId, "modInstallGameDlls", { error: "jogo_nao_configurado" });
    return { ok: false, error: "Jogo não configurado." };
  }

  const protonPath = config.protonVersion || "";
  const prefixPath = config.protonPrefix || "";
  if (!protonPath || !prefixPath) {
    logPlay(gameId, "modInstallGameDlls", { error: "proton_ou_prefixo_faltando" });
    return { ok: false, error: "Proton e prefixo devem estar configurados." };
  }

  logPlay(gameId, "modInstallGameDlls", { protonPath, prefixPath, extraVerbs: (extraVerbs || []).join(",") });

  try {
    const result = await MakaiRPC.call<{
      installed: string[];
      errors: string[];
    }>("install_game_dlls", {
      game_id: gameId,
      prefix_path: prefixPath,
      proton_path: protonPath,
      extra_verbs: extraVerbs,
    });

    logPlay(gameId, "modInstallGameDlls_result", {
      installed: (result.installed || []).join(","),
      errors: (result.errors || []).join(","),
    });

    return {
      ok: true,
      data: {
        installed: result.installed || [],
        errors: result.errors || [],
      },
    };
  } catch (err) {
    logPlay(gameId, "modInstallGameDlls", { error: String(err).slice(0, 200) });
    return { ok: false, error: `Erro RPC: ${String(err)}` };
  }
});
