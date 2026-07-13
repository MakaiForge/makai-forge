/**
 * EnvironmentScanner — Única fonte de verdade para o estado do ambiente.
 *
 * SEMPRE lê do disco. NUNCA usa cache em memória.
 * Qualquer ação do programa (Instalar, Play, Configurar, Preparar Prefixo)
 * chama scan() para descobrir o estado REAL do ambiente.
 *
 * Regra: o programa nunca "lembra" que o prefixo existe.
 * Ele descobriu novamente, toda vez.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ModStorageService } from "@main/services";
import { getGameModule, getGameInfo } from "@games/registry";
import { gameDllCatalog } from "./game-dlls-service";
import { detectGame } from "./detection";
import { defaultStagingDir, defaultPrefixDir } from "./steam-library";

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
}

export interface FrameworkStatus {
  name: string
  installed: boolean
}

export interface ScanOptions {
  gameId: string
  profile?: string
}

// ── Core ──

export function scanEnvironment(opts: ScanOptions): EnvironmentStatus {
  const { gameId } = opts;
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
  };

  // ── 1. Ler config do jogo ──
  const gameConfig = ModStorageService.get<any>(`game:${gameId}:config`);

  // ── 2. Game path ──
  let rawGamePath = gameConfig?.gamePath || "";
  if (!rawGamePath) {
    const detected = detectGame(gameId);
    if (detected.source && detected.gamePath) {
      rawGamePath = detected.gamePath;
      // Salvar auto-detecção
      ModStorageService.put(`game:${gameId}:config`, {
        gamePath: rawGamePath,
        stagingDir: gameConfig?.stagingDir || defaultStagingDir(gameId),
        protonPrefix: gameConfig?.protonPrefix || defaultPrefixDir(gameId),
        protonVersion: gameConfig?.protonVersion || "",
      });
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
    } catch {
      status.errors.push(`Não foi possível criar pasta de mods: ${status.stagingDir}`);
    }
  }

  // ── 4. Prefix ──
  const rawPrefix = gameConfig?.protonPrefix || "";
  status.prefixPath = rawPrefix ? expandHome(rawPrefix) : null;
  if (status.prefixPath) {
    const resolved = resolvePrefixDir(status.prefixPath);
    status.prefixPath = resolved;
    status.prefixValid = resolved ? isValidPrefix(resolved) : false;
  }

  if (!rawPrefix) {
    status.errors.push("Prefixo não configurado");
  } else if (!status.prefixPath) {
    status.errors.push(`Prefixo não encontrado: ${rawPrefix}`);
  } else if (!status.prefixValid) {
    status.errors.push(`Prefixo incompleto: ${status.prefixPath}`);
  }

  // ── 5. Proton ──
  const protonPath = gameConfig?.protonVersion
    || readProtonFromStore()
    || "";
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
      status.errors.push(`DLL overrides não aplicados: ${status.dllOverridesMissing.join(", ")}`);
    }
  }

  // ── 7. Registry (Bethesda) ──
  if (status.prefixPath && status.prefixValid) {
    status.registryOk = checkRegistry(status.prefixPath, gameId, gameName);
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
  status.ready = status.gamePathExists
    && status.prefixValid
    && status.protonExists
    && status.dllOverridesOk
    && status.registryOk;

  return status;
}

// ── Helpers ──

function readProtonFromStore(): string {
  // 1. In-memory cache (ModStorageService)
  const cached = ModStorageService.get<string>("proton_binary");
  if (cached) return cached;

  // 2. Direct disk read (fallback para cache stale)
  try {
    const storePath = path.join(os.homedir(), ".config", "makai-forger", "mods-store.json");
    const raw = fs.readFileSync(storePath, "utf-8");
    const store = JSON.parse(raw);
    return store.proton_binary || "";
  } catch {
    return "";
  }
}

function expandHome(p: string): string {
  if (p.startsWith("~")) return p.replace("~", os.homedir());
  return p;
}

function resolvePrefixDir(prefixPath: string): string | null {
  if (!prefixPath) return null;
  prefixPath = expandHome(prefixPath);
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) return prefixPath;
  if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) return path.join(prefixPath, "pfx");
  return null;
}

function isValidPrefix(pfxPath: string): boolean {
  return (
    fs.existsSync(path.join(pfxPath, "user.reg")) &&
    fs.existsSync(path.join(pfxPath, "system.reg")) &&
    fs.existsSync(path.join(pfxPath, "drive_c")) &&
    fs.existsSync(path.join(pfxPath, "dosdevices"))
  );
}

function dllOverridesMatch(prefixPath: string, required: Record<string, string>): boolean {
  const actualPfx = resolvePrefixDir(prefixPath);
  if (!actualPfx) return false;
  const userRegPath = path.join(actualPfx, "user.reg");
  if (!fs.existsSync(userRegPath)) return false;
  try {
    const content = fs.readFileSync(userRegPath, "utf-8");
    const sectionStart = content.indexOf("[Software\\\\Wine\\\\DllOverrides]");
    if (sectionStart < 0) return false;
    const sectionEnd = content.indexOf("\n[", sectionStart + 1);
    const section = sectionEnd >= 0
      ? content.slice(sectionStart, sectionEnd)
      : content.slice(sectionStart);
    for (const [dll, mode] of Object.entries(required)) {
      const search = `"${dll.toLowerCase()}"="${mode}"`;
      if (!section.includes(search)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function checkRegistry(prefixPath: string, gameId: string, gameName: string): boolean {
  // Para jogos Bethesda, verificar se o registry foi seedado
  const BethesdaGames = ["skyrim", "skyrim-se", "skyrim-ae", "fallout4", "oblivion", "morrowind"];
  if (!BethesdaGames.some(bg => gameId.toLowerCase().includes(bg))) {
    return true; // Não-Bethesda: sem registry obrigatório
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

// ── IPC Registration ──

export function registerEnvironmentScanner() {
  const { registerEvent } = require("@main/events/register-event");
  registerEvent("scanEnvironment", async (_event: any, gameId: string) => {
    return scanEnvironment({ gameId });
  });
}
