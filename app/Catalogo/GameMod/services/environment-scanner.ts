/**
 * EnvironmentScanner — Única fonte de verdade para o estado do ambiente.
 *
 * SEMPRE lê do disco. NUNCA usa cache em memória.
 * Qualquer ação do programa (Instalar, Play, Configurar, Preparar Prefixo)
 * chama scan() para descobrir o estado REAL do ambiente.
 *
 * Com autoFix: true, corrige automaticamente problemas rápidos e não-destrutivos
 * (DLL overrides, registry, nested pfx). Problemas destrutivos (recriar prefix)
 * ou lentos (baixar SKSE/frameworks) são reportados mas não corrigidos.
 *
 * Regra: o programa nunca "lembra" que o prefixo existe.
 * Ele descobriu novamente, toda vez.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ModStorageService, logger } from "@main/services";
import { getGameModule, getGameInfo } from "@games/registry";
import { applyWineDllOverrides } from "@container/core/dll-overrides";
import { seedBethesdaRegistry } from "@container/core/bethesda-registry";
import { gameDllCatalog } from "./game-dlls-service";
import { detectGame } from "./detection";
import { defaultStagingDir, defaultPrefixDir } from "./steam-library";
import { resolvePrefixDir, isValidPrefix, dllOverridesMatch, cleanNestedPfx } from "./prefix-validator";

// ── Types ──

export interface EnvironmentStatus {
  gameId: string
  gamePath: string
  gamePathExists: boolean
  stagingDir: string
  prefixPath: string | null
  prefixValid: boolean
  protonPath: string
  protonExists: boolean
  steamAppId?: string
  libraryPath?: string
  dllOverridesOk: boolean
  dllOverridesMissing: string[]
  registryOk: boolean
  skseInstalled: boolean
  skseName: string
  frameworks: FrameworkStatus[]
  depsInstalled: string[]
  depsMissing: string[]
  ready: boolean
  errors: string[]
  fixed: string[]
}

export interface FrameworkStatus {
  name: string
  installed: boolean
}

export interface ScanOptions {
  gameId: string
  profile?: string
  /** Corrige automaticamente problemas rápidos e não-destrutivos */
  autoFix?: boolean
}

// ── Core ──

export function scanEnvironment(opts: ScanOptions): EnvironmentStatus {
  const { gameId, autoFix = false } = opts;

  // Guard: gameId vazio nunca deveria ser escaneado
  if (!gameId) {
    return {
      gameId: "",
      gamePath: "", gamePathExists: false, stagingDir: "",
      prefixPath: null, prefixValid: false,
      protonPath: "", protonExists: false,
      dllOverridesOk: true, dllOverridesMissing: [],
      registryOk: true, skseInstalled: false, skseName: "",
      frameworks: [], depsInstalled: [], depsMissing: [],
      ready: false, errors: ["gameId vazio — selecione um jogo primeiro"],
      fixed: [],
    };
  }

  const gameModule = getGameModule(gameId, "");
  const gameName = gameModule?.displayName || gameId;

  const status: EnvironmentStatus = {
    gameId,
    gamePath: "",
    gamePathExists: false,
    stagingDir: "",
    prefixPath: null,
    prefixValid: false,
    protonPath: "",
    protonExists: false,
    dllOverridesOk: true,
    dllOverridesMissing: [],
    registryOk: true,
    skseInstalled: false,
    skseName: "",
    frameworks: [],
    depsInstalled: [],
    depsMissing: [],
    ready: false,
    errors: [],
    fixed: [],
  };

  // ── 1. Ler config do jogo ──
  let gameConfig = ModStorageService.get<any>(`game:${gameId}:config`);

  // Limpar ghost entry "game::config" (gameId vazio)
  if (gameId) {
    const ghost = ModStorageService.get<any>("game::config");
    if (ghost) {
      ModStorageService.delete("game::config");
      status.fixed.push("Removida config fantasma game::config");
    }
  }

  // ── 2. Game path ──
  let rawGamePath = gameConfig?.gamePath || "";
  let detectedPrefixFromDetection: string | null = null;
  if (!rawGamePath) {
    const detected = detectGame(gameId);
    if (detected.source && detected.gamePath) {
      rawGamePath = detected.gamePath;
      detectedPrefixFromDetection = detected.prefixPath;
      gameConfig = {
        gamePath: rawGamePath,
        stagingDir: gameConfig?.stagingDir || defaultStagingDir(gameId),
        protonPrefix: gameConfig?.protonPrefix || detectedPrefixFromDetection || defaultPrefixDir(gameId),
        protonVersion: gameConfig?.protonVersion || "",
      };
      ModStorageService.put(`game:${gameId}:config`, gameConfig);
      status.fixed.push(`Game path auto-detectado: ${rawGamePath}`);
    }
  }
  status.gamePath = rawGamePath ? expandHome(rawGamePath) : "";
  status.gamePathExists = status.gamePath ? fs.existsSync(status.gamePath) : false;

  if (!rawGamePath) {
    status.errors.push(`${gameName}: caminho do jogo não configurado`);
  } else if (!status.gamePathExists) {
    status.errors.push(`${gameName}: caminho não encontrado: ${status.gamePath}`);
  }

  // ── 2b. Steam App ID + Library Path ──
  const gameInfo = getGameInfo(gameId);
  status.steamAppId = gameInfo?.steamAppId;
  if (status.gamePath) {
    const commonIdx = status.gamePath.lastIndexOf(path.sep + "common" + path.sep);
    if (commonIdx !== -1) {
      status.libraryPath = status.gamePath.slice(0, commonIdx);
    }
  }
  if (!status.libraryPath && status.prefixPath) {
    const compatIdx = status.prefixPath.lastIndexOf(path.sep + "compatdata" + path.sep);
    if (compatIdx !== -1) {
      status.libraryPath = status.prefixPath.slice(0, compatIdx);
    }
  }

  // ── 3. Staging dir ──
  const rawStaging = gameConfig?.stagingDir || "";
  status.stagingDir = rawStaging
    ? expandHome(rawStaging)
    : path.join(os.homedir(), "Games", "Mods", gameId, "staging");

  if (!fs.existsSync(status.stagingDir)) {
    try {
      fs.mkdirSync(status.stagingDir, { recursive: true });
      status.fixed.push(`Pasta de mods criada: ${status.stagingDir}`);
    } catch {
      status.errors.push(`Não foi possível criar pasta de mods: ${status.stagingDir}`);
    }
  }

  // ── 4. Prefix ──
  let rawPrefix = gameConfig?.protonPrefix || "";
  if (!rawPrefix) {
    // Buscar prefix existente em有多locais conocidos
    rawPrefix = findExistingPrefix(gameId, status.steamAppId, status.libraryPath) || defaultPrefixDir(gameId);
    const resolved = resolvePrefixDir(rawPrefix);
    if (resolved) {
      gameConfig = { ...gameConfig, protonPrefix: rawPrefix };
      ModStorageService.put(`game:${gameId}:config`, gameConfig);
      status.fixed.push(`Prefix auto-detectado no disco: ${rawPrefix}`);
    } else if (rawPrefix !== defaultPrefixDir(gameId)) {
      // O prefix encontrado pelo detection nao e valido, usar default
      rawPrefix = defaultPrefixDir(gameId);
    }
  }
  status.prefixPath = rawPrefix ? expandHome(rawPrefix) : null;
  if (status.prefixPath) {
    const resolved = resolvePrefixDir(status.prefixPath);
    if (resolved) {
      status.prefixPath = resolved;
      status.prefixValid = isValidPrefix(resolved);
    } else {
      status.prefixValid = false;
    }

    // Auto-fix: limpar nested pfx (rápido, não-destrutivo)
    if (autoFix && resolved) {
      const hadNested = fs.existsSync(path.join(resolved, "pfx"));
      cleanNestedPfx(resolved);
      if (hadNested) {
        status.fixed.push("Nested pfx/ removido");
      }
    }
  }

  if (!rawPrefix) {
    status.errors.push("Prefixo não configurado");
  } else if (!status.prefixPath) {
    status.errors.push(`Prefixo não encontrado: ${rawPrefix}`);
  } else if (!status.prefixValid) {
    status.errors.push(`Prefixo incompleto: ${status.prefixPath}`);
  }

  // ── 5. Proton ──
  const protonPath = gameConfig?.protonVersion || "";
  status.protonPath = protonPath;
  status.protonExists = protonPath ? fs.existsSync(path.join(protonPath, "proton")) : false;

  if (!protonPath) {
    status.errors.push("Proton não configurado");
  } else if (!status.protonExists) {
    status.errors.push(`Proton não encontrado: ${protonPath}`);
  }

  // ── 6. DLL Overrides ──
  const dllOverrides = gameModule?.getWineDllOverrides?.() || {};
  if (Object.keys(dllOverrides).length > 0 && status.prefixPath) {
    status.dllOverridesOk = dllOverridesMatch(status.prefixPath, dllOverrides);
    if (!status.dllOverridesOk) {
      status.dllOverridesMissing = Object.keys(dllOverrides);

      // Auto-fix: aplicar DLL overrides (rápido, não-destrutivo)
      if (autoFix && status.prefixValid) {
        try {
          applyWineDllOverrides(status.prefixPath, dllOverrides);
          status.dllOverridesOk = true;
          status.dllOverridesMissing = [];
          status.fixed.push(`DLL overrides aplicados: ${Object.keys(dllOverrides).join(", ")}`);
        } catch (err) {
          status.errors.push(`Falha ao aplicar DLL overrides: ${err}`);
        }
      } else {
        status.errors.push(`DLL overrides não aplicados: ${status.dllOverridesMissing.join(", ")}`);
      }
    }
  }

  // ── 7. Registry (Bethesda) ──
  if (status.prefixPath && status.prefixValid) {
    status.registryOk = checkRegistry(status.prefixPath, gameId, gameName);

    // Auto-fix: seed registry Bethesda (rápido, não-destrutivo)
    if (autoFix && !status.registryOk && gameModule?.bethesdaRegistryName) {
      try {
        const ok = seedBethesdaRegistry(status.prefixPath, status.gamePath, gameModule.bethesdaRegistryName);
        if (ok) {
          status.registryOk = true;
          status.fixed.push(`Registry Bethesda (${gameModule.bethesdaRegistryName}) aplicado`);
        }
      } catch (err) {
        status.errors.push(`Falha ao aplicar registry Bethesda: ${err}`);
      }
    }

    if (!status.registryOk) {
      status.errors.push("Registry Bethesda não aplicado");
    }
  }

  // ── 8. Script Extender ──
  if (gameModule) {
    const release = gameModule.getScriptExtenderRelease?.();
    if (release) {
      status.skseName = release.loaderName;
      if (status.gamePath) {
        status.skseInstalled = fs.existsSync(path.join(status.gamePath, release.loaderName));
        if (!status.skseInstalled) {
          status.errors.push(`${release.loaderName} não encontrado`);
        }
      }
    }
  }

  // ── 9. Frameworks ──
  if (gameModule) {
    const frameworks = gameModule.getAutoInstallFrameworks?.() || [];
    status.frameworks = frameworks.map(fw => ({
      name: fw.name,
      installed: status.gamePath ? isFrameworkInstalled(status.gamePath, fw) : false,
    }));
    const missingFw = status.frameworks.filter(f => !f.installed);
    if (missingFw.length > 0) {
      status.errors.push(`Frameworks faltando: ${missingFw.map(f => f.name).join(", ")}`);
    }
  }

  // ── 10. Deps (vcrun, d3dcompiler, dxvk) ──
  const gameDllInfo = gameDllCatalog.getGame(gameId);
  if (gameDllInfo?.autoInstallDeps?.length && status.prefixPath) {
    const sys32 = path.join(status.prefixPath, "drive_c", "windows", "system32");
    for (const dep of gameDllInfo.autoInstallDeps) {
      if (checkDepInstalled(dep, sys32)) {
        status.depsInstalled.push(dep);
      } else {
        status.depsMissing.push(dep);
        status.errors.push(`Dep faltando: ${dep}`);
      }
    }
  }

  // ── 11. Ready ──
  // Proton só bloqueia se o prefixo NÃO existe.
  // Se o prefixo já é válido, o Proton será resolvido em runtime (ensureProton no Play).
  const protonBlocking = status.prefixValid ? true : status.protonExists;
  status.ready = status.gamePathExists
    && status.prefixValid
    && protonBlocking
    && status.dllOverridesOk
    && status.registryOk;

  if (autoFix && status.fixed.length > 0) {
    logger.log(`[EnvironmentScanner] auto-fix applied for ${gameId}: ${status.fixed.join("; ")}`);
  }

  return status;
}

// ── Helpers ──

function expandHome(p: string): string {
  if (p.startsWith("~")) return p.replace("~", os.homedir());
  return p;
}



function checkRegistry(prefixPath: string, gameId: string, _gameName: string): boolean {
  const BethesdaGames = ["skyrim", "skyrim-se", "skyrim-ae", "fallout4", "oblivion", "morrowind"];
  if (!BethesdaGames.some(bg => gameId.toLowerCase().includes(bg))) {
    return true;
  }

  const pfx = resolvePrefixDir(prefixPath);
  if (!pfx) return false;

  const systemRegPath = path.join(pfx, "system.reg");
  if (!fs.existsSync(systemRegPath)) return false;

  try {
    const content = fs.readFileSync(systemRegPath, "utf-8");
    return content.includes("Bethesda Softworks");
  } catch {
    return false;
  }
}

function isFrameworkInstalled(gamePath: string, fw: { name: string; detector: { file?: string; folder?: string } }): boolean {
  if (fw.detector.folder) {
    return fs.existsSync(path.join(gamePath, fw.detector.folder));
  }
  if (fw.detector.file) {
    return fs.existsSync(path.join(gamePath, fw.detector.file));
  }
  return false;
}

function checkDepInstalled(dep: string, sys32: string): boolean {
  if (!sys32 || !fs.existsSync(sys32)) return false;
  switch (dep) {
    case "vcredist":
      return fs.existsSync(path.join(sys32, "vcruntime140.dll"));
    case "d3dcompiler_47":
      return fs.existsSync(path.join(sys32, "d3dcompiler_47.dll"));
    case "dxvk":
      return fs.existsSync(path.join(sys32, "d3d11.dll")) &&
        fs.existsSync(path.join(sys32, "dxgi.dll"));
    default:
      return true;
  }
}

/**
 * Busca prefix existente em有多locais conocidos:
 * 1. Steam compatdata (se steamAppId e libraryPath sao conhecidos)
 * 2. Default prefix dir (~/Games/Prefix/{slug}/)
 * Retorna o caminho do prefix se encontrado, null caso contrario.
 */
function findExistingPrefix(gameId: string, _steamAppId?: string, _libraryPath?: string): string | null {
  // Sempre wrapper ~/Games/Prefix/{gameId}/ — unico prefixo que o app gerencia
  const defaultPrefix = defaultPrefixDir(gameId);
  const resolved = resolvePrefixDir(defaultPrefix);
  if (resolved) return resolved;
  return null;
}
