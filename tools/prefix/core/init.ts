import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { logger, Umu } from "@main/services";
import { findProtonPath, findSteamClientPath, parseLibraryFolders } from "./steam-paths";
import { clearCompatData, ensureCompatData } from "./clear";
import { normalizePrefixPath } from "./validate";
import { logOperation, logCall, logError as auditLogError } from "../activity-logger";

const MAKAI_CLIENT_DIR = path.join(os.homedir(), ".config", "makai-forger", "makai-client");

export interface CreatePrefixOptions {
  /** Path to Proton directory (containing `proton` binary) */
  protonPath: string;
  /** WINEPREFIX path (where drive_c/ will be created) */
  prefixPath: string;
  /** STEAM_COMPAT_DATA_PATH (parent of pfx/) */
  compatDataPath?: string;
  /** STEAM_COMPAT_CLIENT_INSTALL_PATH */
  steamClientPath?: string;
  /** Prefer umu-run */
  useUmu?: boolean;
  /** Progress callback */
  onProgress?: (msg: string) => void;
  /** Timeout in ms (default 120s) */
  timeout?: number;
  /** Game ID for umu-run GAMEID env */
  gameId?: string;
  /** Umu binary path (auto-detected if not provided) */
  umuBinary?: string;
}

export interface CreatePrefixResult {
  success: boolean;
  pfxDir: string;
  error?: string;
  errorType?: "default_pfx" | "timeout" | "spawn" | "not_found" | "generic";
  method?: "umu" | "proton_wineboot" | "proton_run" | "direct_wineboot";
}

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c");
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath;
  const pfx = path.join(prefixPath, "pfx");
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx;
  return prefixPath;
}

function prefixExists(prefixPath: string): boolean {
  const actual = resolveActualPrefix(prefixPath);
  return (
    fs.existsSync(path.join(actual, "user.reg")) &&
    fs.existsSync(path.join(actual, "system.reg")) &&
    fs.existsSync(path.join(actual, "drive_c")) &&
    fs.existsSync(path.join(actual, "dosdevices"))
  );
}

/**
 * UNIFIED prefix creator — single function for ALL prefix creation paths.
 *
 * Strategy (in order):
 *   1. umu-run wineboot -u (if useUmu && umu found)
 *   2. Direct wineboot from Proton dist/files/
 *   3. `proton wineboot -u`
 *   4. `proton run wineboot -u`
 */
export function createPrefix(options: CreatePrefixOptions): Promise<CreatePrefixResult> {
  const _start = Date.now();
  logOperation("createPrefix", "started", {
    prefixPath: options.prefixPath,
    protonPath: options.protonPath,
    gameId: options.gameId,
    useUmu: !!options.useUmu,
  });

  const {
    protonPath,
    prefixPath,
    compatDataPath,
    steamClientPath,
    useUmu,
    onProgress,
    timeout = 120000,
    gameId,
    umuBinary: umuOverride,
  } = options;

  const pfxDir = normalizePrefixPath(prefixPath);
  const protonBin = path.join(protonPath, "proton");

  return new Promise((resolve) => {
    const _loggedResolve = (result: CreatePrefixResult) => {
      logOperation("createPrefix", result.success ? "success" : "error", {
        pfxDir: result.pfxDir,
        method: result.method,
        error: result.error,
        errorType: result.errorType,
        duration_ms: Date.now() - _start,
      });
      resolve(result);
    };

    const emit = onProgress || (() => {});

    // Already exists?
    if (prefixExists(pfxDir)) {
      logger.info("Prefix already exists", { pfxDir });
      emit("✅ Prefixo já existe");
      _loggedResolve({ success: true, pfxDir });
      return;
    }

    fs.mkdirSync(pfxDir, { recursive: true });

    // Build base env (clean vars that break Proton's embedded Python)
    const baseEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      WINEPREFIX: pfxDir,
    };
    delete baseEnv.PYTHONHOME;
    delete baseEnv.PYTHONPATH;
    delete baseEnv.PYTHONSTARTUP;
    delete baseEnv.PYTHONOPTIMIZE;

    // MAKAI_* → STEAM_COMPAT_* translation layer
    // Proton internals still read STEAM_COMPAT_*, but we use MAKAI_* everywhere else.
    const makaiClientPath = process.env.MAKAI_CLIENT_INSTALL_PATH || MAKAI_CLIENT_DIR;
    if (!fs.existsSync(makaiClientPath)) {
      fs.mkdirSync(path.join(makaiClientPath, "legacycompat"), { recursive: true });
    }
    if (compatDataPath) baseEnv.STEAM_COMPAT_DATA_PATH = compatDataPath;
    baseEnv.STEAM_COMPAT_CLIENT_INSTALL_PATH = makaiClientPath;
    baseEnv.MAKAI_CLIENT_INSTALL_PATH = makaiClientPath;
    if (compatDataPath) baseEnv.MAKAI_COMPAT_DATA_PATH = compatDataPath;
    baseEnv.WINEDLLOVERRIDES = "winemenubuilder.exe=d";

    const trySpawn = (
      cmd: string,
      args: string[],
      env: Record<string, string>,
      _method: CreatePrefixResult["method"],
      attached = true,
      strategyTimeoutMs?: number,
    ): Promise<{ ok: boolean; errType?: CreatePrefixResult["errorType"]; stderr?: string }> => {
      return new Promise((r) => {
        const child = spawn(cmd, args, {
          env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: !attached,
        });

        let stderrAccum = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          stderrAccum += text;
        });
        child.stdout?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          emit(text.trimEnd());
        });

        const done = (ok: boolean, errType?: CreatePrefixResult["errorType"]) => {
          child.kill();
          r({ ok, errType, stderr: stderrAccum });
        };

        if (attached) {
          child.on("close", (code) => {
            const ok = code === 0 || prefixExists(pfxDir);
            if (!ok && stderrAccum.includes("default_pfx")) {
              done(false, "default_pfx");
            } else {
              done(ok);
            }
          });
          child.on("error", () => done(false, "spawn"));
        } else {
          child.unref();
          // Poll for prefix existence
          const poll = async () => {
            for (let i = 0; i < 60; i++) {
              await new Promise((r) => setTimeout(r, 500));
              if (prefixExists(pfxDir)) {
                done(true);
                return;
              }
            }
            done(prefixExists(pfxDir));
          };
          poll();
        }

        // Timeout per estratégia
        setTimeout(() => done(false, "timeout"), strategyTimeoutMs || timeout);
      });
    };

    const exec = async () => {
      // Strategy 1: umu-run
      if (useUmu) {
        const umuBin = umuOverride || (await findUmuBinary());
        if (umuBin) {
          emit("🔧 Usando umu-run...");
          const umuEnv = { ...baseEnv };
          if (gameId) umuEnv.GAMEID = gameId;
          umuEnv.PROTONPATH = protonPath;
          const r = await trySpawn(umuBin, ["wineboot", "-u"], umuEnv, "umu");
          if (r.ok) {
            _loggedResolve({ success: true, pfxDir, method: "umu" });
            return;
          }
          emit("⚠ umu-run falhou, tentando Proton diretamente...");
        }
      }

      // Strategy 2: direct wineboot from Proton dist/files
      const winebootBin = findProtonWineBinary(protonPath, "wineboot");
      if (winebootBin) {
        emit("🔧 Usando wineboot direto...");
        const r = await trySpawn(winebootBin, ["-u"], baseEnv, "direct_wineboot");
        if (r.ok) {
          _loggedResolve({ success: true, pfxDir, method: "direct_wineboot" });
          return;
        }
        emit("⚠ wineboot direto falhou, tentando Proton wineboot...");
      }

      // Strategy 3: `proton wineboot -u` (timeout 20s — alguns Protons penduram aqui)
      if (fs.existsSync(protonBin)) {
        emit("🔧 Usando proton wineboot...");
        const r = await trySpawn(protonBin, ["wineboot", "-u"], baseEnv, "proton_wineboot", true, 20000);
        if (r.ok) {
          _loggedResolve({ success: true, pfxDir, method: "proton_wineboot" });
          return;
        }

        if (r.errType === "default_pfx") {
          _loggedResolve({
            success: false,
            pfxDir,
            error: "default_pfx corrompido, necessário reinstalar Proton",
            errorType: "default_pfx",
            method: "proton_wineboot",
          });
          return;
        }

        emit("⚠ Proton wineboot falhou, tentando proton run wineboot...");

        // Strategy 4: `proton run wineboot -u` (120s — comprovado funcionar)
        const r2 = await trySpawn(protonBin, ["run", "wineboot", "-u"], baseEnv, "proton_run", true, 120000);
        if (r2.ok || prefixExists(pfxDir)) {
          _loggedResolve({ success: true, pfxDir, method: "proton_run" });
          return;
        }

        _loggedResolve({
          success: false,
          pfxDir,
          error: `Todas as estratégias falharam. Último stderr: ${(r2.stderr || "").slice(0, 200)}`,
          errorType: "generic",
          method: "proton_run",
        });
        return;
      }

      _loggedResolve({
        success: false,
        pfxDir,
        error: "Proton binary not found",
        errorType: "not_found",
      });
    };

    exec();
  });
}

async function findUmuBinary(): Promise<string | null> {
  const { getUmuBinaryPath } = await import("@provision/ForgePipeline/orchestrator/prefix-setup");
  const umu = getUmuBinaryPath();
  return fs.existsSync(umu) ? umu : null;
}

function findProtonWineBinary(protonPath: string, name: string): string | null {
  for (const base of ["dist", "files"]) {
    const candidate = path.join(protonPath, base, "bin", name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ── Legacy wrappers ──────────────────────────────────────────────────────────

export function initPrefix(
  protonBinary: string,
  compatDataPath: string,
  steamClientPath: string,
): Promise<boolean> {
  const prefixPath = path.join(compatDataPath, "pfx");
  return createPrefix({
    protonPath: path.dirname(protonBinary),
    prefixPath,
    compatDataPath,
    steamClientPath,
    timeout: 120000,
  }).then((r) => r.success);
}

export function initPrefixViaUmu(
  umuBinary: string,
  protonPath: string,
  gameId: string,
  winePrefixPath: string,
  onLog?: (msg: string) => void,
): Promise<boolean> {
  const prefixPath = path.join(winePrefixPath, "pfx");
  return createPrefix({
    protonPath,
    prefixPath,
    useUmu: true,
    umuBinary,
    gameId,
    onProgress: onLog,
    timeout: 120000,
  }).then((r) => r.success);
}

export function checkAndCreateWinePrefix(
  winePrefixPath: string,
  wineBinaryPath: string | null,
): Promise<boolean> {
  if (!winePrefixPath) return Promise.resolve(false);
  if (prefixExists(winePrefixPath)) return Promise.resolve(true);

  const opts: CreatePrefixOptions = {
    protonPath: wineBinaryPath || "/usr/share/steam/compatibilitytools.d",
    prefixPath: winePrefixPath,
    timeout: 120000,
  };

  if (wineBinaryPath && Umu.isValidProtonPath(wineBinaryPath)) {
    opts.protonPath = wineBinaryPath;
  }

  return createPrefix(opts).then((r) => r.success);
}

// ── Unified ensureGamePrefix ─────────────────────────────────────────────────

export interface EnsureGamePrefixOptions {
  appId: string
  protonName?: string
  onProgress?: (msg: string) => void
}

export interface EnsureGamePrefixResult {
  success: boolean
  appId: string
  protonName: string | null
  pfxDir?: string
  error?: string
}

/**
 * Unified function: set Proton, clear prefix, recreate prefix.
 *
 * - If `protonName` is not given, reads current Proton from Steam config.vdf.
 * - If Proton binary is not found, returns error.
 * - Sets the Proton in Steam config.
 * - Clears the old compatdata directory (all Steam libraries).
 * - Creates a new prefix via createPrefix().
 *
 * Callable from ANY part of the app (IPC, ForgePipeline, ModsManager, etc.).
 */
export async function ensureGamePrefix(
  options: EnsureGamePrefixOptions,
): Promise<EnsureGamePrefixResult> {
  const _start = Date.now();
  logOperation("ensureGamePrefix", "started", { appId: options.appId, protonName: options.protonName });

  const { appId, onProgress } = options;
  const emit = onProgress || (() => {});
  let { protonName } = options;

  const result: EnsureGamePrefixResult = {
    success: false,
    appId,
    protonName: protonName || null,
  };

  const _finish = () => {
    logOperation("ensureGamePrefix", result.success ? "success" : "error", {
      appId: result.appId,
      protonName: result.protonName,
      pfxDir: result.pfxDir,
      error: result.error,
      duration_ms: Date.now() - _start,
    });
    return result;
  };

  // 1. Resolve Proton name
  if (!protonName) {
    emit("🔍 Lendo Proton atual do Steam...");
    try {
      const { getSteamGameProton } = await import("@main/services/steam-config-vdf");
      const current = await getSteamGameProton(appId);
      if (current?.name) {
        protonName = current.name;
        result.protonName = current.name;
        emit(`   Proton atual: ${current.name}`);
      } else {
        emit("   ℹ Nenhum Proton configurado — limpando prefixo sem recriar");
        await clearSteamPrefixCore(appId);
        result.success = true;
        return _finish();
      }
    } catch (err) {
      result.error = `Falha ao ler config.vdf: ${String(err).slice(0, 200)}`;
      logger.error(result.error);
      return _finish();
    }
  }

  // 2. Set Proton in Steam config
  emit(`⚙ Configurando Proton "${protonName}" no Steam...`);
  try {
    const { setSteamGameProton } = await import("@main/services/steam-config-vdf");
    const wrote = await setSteamGameProton(appId, protonName);
    if (!wrote) {
      result.error = "Falha ao escrever config.vdf";
      logger.error(result.error);
      return _finish();
    }
    emit("   ✅ Proton configurado no Steam");
  } catch (err) {
    result.error = `Erro ao configurar Proton: ${String(err).slice(0, 200)}`;
    logger.error(result.error);
    return _finish();
  }

  // 3. Find Proton binary
  emit(`🔧 Localizando binário do Proton "${protonName}"...`);
  const protonBinary = findProtonPath(protonName);
  if (!protonBinary) {
    result.error = `Proton "${protonName}" não encontrado. Use a aba Proton Tools para baixar.`;
    logger.error(result.error);
    return _finish();
  }
  emit(`   ✅ ${protonName} encontrado`);

  // 4. Find and clear compatdata
  emit("🧹 Limpando prefixo antigo...");
  const pfxDir = await clearSteamPrefixCore(appId);
  if (!pfxDir) {
    result.error = "Não foi possível localizar o diretório compatdata do jogo";
    logger.error(result.error);
    return _finish();
  }
  emit("   ✅ Prefixo antigo removido");

  // 5. Create new prefix
  emit("⚙ Recriando prefixo...");
  const steamClientPath = findSteamClientPath();
  const cpResult = await createPrefix({
    protonPath: path.dirname(protonBinary),
    prefixPath: path.join(pfxDir, "pfx"),
    compatDataPath: pfxDir,
    steamClientPath,
    onProgress: (msg) => { if (msg.trim()) emit(msg); },
    timeout: 120000,
  });

  if (!cpResult.success) {
    result.error = cpResult.error || "Falha ao criar prefixo";
    logger.error(result.error);
    return _finish();
  }

  emit("   ✅ Prefixo recriado com sucesso");
  result.success = true;
  result.pfxDir = path.join(pfxDir, "pfx");
  return _finish();
}

/**
 * Clear compatdata for an appId across all Steam libraries.
 * Returns the compatdata directory path, or null if not found.
 */
export async function clearSteamPrefixCore(appId: string): Promise<string | null> {
  const { getSteamLocation } = await import("@main/services/steam");

  const steamPath = await getSteamLocation().catch(() => null);
  if (!steamPath) return null;

  const libraryPaths = parseLibraryFolders(steamPath);
  let compatDataPath: string | null = null;

  for (const libPath of libraryPaths) {
    const compatDir = path.join(libPath, "compatdata", appId);
    if (fs.existsSync(compatDir)) {
      clearCompatData(compatDir);
      compatDataPath = compatDir;
      break;
    }
  }

  if (!compatDataPath) {
    for (const libPath of libraryPaths) {
      const candidate = path.join(libPath, "compatdata", appId);
      ensureCompatData(candidate);
      compatDataPath = candidate;
      break;
    }
  }

  return compatDataPath;
}
