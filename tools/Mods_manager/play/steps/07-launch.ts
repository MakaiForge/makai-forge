import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { app } from "electron";

import { getGameInfo, getGameModule } from "@games/registry";
import { findSteamClientPath } from "@prefix/core/steam-paths";
import { logger } from "@main/services";
import type { PlayResult, SendProgress } from "../types";

/** Reference to the currently running game process (if any). */
let activeGameProcess: ChildProcess | null = null;

/**
 * Kill the active game process. Called when the user clicks "Fechar" on the
 * LaunchOverlay. Sends SIGTERM first, escalates to SIGKILL after 3 seconds.
 */
export function killGameProcess(): boolean {
  if (!activeGameProcess || !activeGameProcess.pid) return false;
  const pid = activeGameProcess.pid;
  const procName = activeGameProcess.spawnargs?.join(" ") || `pid=${pid}`;
  logger.info(`[Launch] Killing game process: ${procName}`);
  try {
    process.kill(-pid, "SIGTERM");
    setTimeout(() => {
      try { process.kill(-pid, "SIGKILL"); } catch { /* already dead */ }
    }, 3000);
  } catch {
    try { activeGameProcess.kill("SIGKILL"); } catch { /* ignore */ }
  }
  activeGameProcess = null;
  return true;
}

function trackProcess(child: ChildProcess): void {
  activeGameProcess = child;
  child.on("close", () => { if (activeGameProcess === child) activeGameProcess = null; });
  child.on("error", () => { if (activeGameProcess === child) activeGameProcess = null; });
}

/**
 * Returns true if the prefix is inside Steam's compatdata directory
 * (e.g. steamapps/compatdata/72850/pfx). Custom prefixes like
 * ~/Games/Prefix/skyrim/ return false.
 */
function isSteamCompatPrefix(prefixPath: string): boolean {
  return prefixPath.includes(path.sep + "compatdata" + path.sep);
}

function buildLaunchEnv(
  steamAppId: string | undefined,
  gamePath: string,
  prefixPath: string,
  protonPath: string,
  _libraryPath?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    WINEPREFIX: prefixPath,
    PROTONPATH: protonPath,
  };

  // STEAM_COMPAT_DATA_PATH: for Steam compatdata, use the parent of pfx/.
  // For custom prefixes, do NOT set this — Proton overrides WINEPREFIX when
  // STEAM_COMPAT_DATA_PATH is set, computing prefix_dir = value + "/pfx/",
  // which would break our custom prefix layout (files at root, not in pfx/).
  if (isSteamCompatPrefix(prefixPath)) {
    if (path.basename(prefixPath) === "pfx") {
      env.STEAM_COMPAT_DATA_PATH = path.dirname(prefixPath);
    } else {
      env.STEAM_COMPAT_DATA_PATH = prefixPath;
    }
  }

  if (gamePath) env.STEAM_COMPAT_INSTALL_PATH = gamePath;
  env.STEAM_COMPAT_CLIENT_INSTALL_PATH = findSteamClientPath();

  if (steamAppId) {
    env.SteamAppId = steamAppId;
    env.SteamGameId = steamAppId;
    env.GAMEID = steamAppId;
  }

  return env;
}

/**
 * Ensure steam_appid.txt exists in the game directory.
 * Proton/Wine games need this for Steam API stubs to identify the game.
 */
function ensureSteamAppIdFile(gamePath: string, steamAppId: string): void {
  if (!steamAppId || !gamePath) return;
  const appIdFile = path.join(gamePath, "steam_appid.txt");
  if (!fs.existsSync(appIdFile)) {
    try { fs.writeFileSync(appIdFile, steamAppId, "utf-8"); } catch { /* ignore */ }
  }
}

/**
 * Kill any stale wineserver to avoid prefix lock conflicts.
 */
function killStaleWineserver(): void {
  try { spawnSync("pkill", ["-9", "wineserver"], { stdio: "pipe" }); } catch {}
  try { spawnSync("killall", ["-9", "wineserver"], { stdio: "pipe" }); } catch {}
}

/**
 * Find umu-run binary (system or bundled).
 */
function findUmuRun(): string | null {
  const systemUmu = spawnSync("which", ["umu-run"], { stdio: "pipe" }).status === 0
    ? "umu-run"
    : null;
  if (systemUmu) return systemUmu;

  const bundled = path.join(app.getAppPath(), "tools", "prefix", "umu-run");
  if (fs.existsSync(bundled)) return bundled;
  return null;
}

/**
 * Find proton binary in a Proton directory.
 */
function findProtonBin(protonPath: string): string | null {
  const candidate = path.join(protonPath, "proton");
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Ensure the Proton tool is symlinked into Steam's compatibilitytools.d
 * so that Proton can find it at runtime.
 */
function ensureProtonSymlink(protonPath: string): void {
  const protonDirName = path.basename(protonPath);
  const steamCompatDir = path.join(
    path.dirname(path.dirname(path.dirname(protonPath))),
    "Steam", "compatibilitytools.d",
  );
  const steamCompatLink = path.join(steamCompatDir, protonDirName);
  if (!fs.existsSync(steamCompatLink) && fs.existsSync(protonPath)) {
    try {
      fs.mkdirSync(steamCompatDir, { recursive: true });
      fs.symlinkSync(protonPath, steamCompatLink);
    } catch { /* ignore */ }
  }
}

/**
 * Launch via steam://rungameid — only for games using Steam's own compatdata prefix.
 * For custom prefixes, use launchCustomPrefix() instead.
 */
async function launchViaSteam(
  steamAppId: string,
  send: SendProgress,
): Promise<PlayResult> {
  const info = getGameInfo(undefined);
  logger.info(`[Launch] Launching via Steam: steam://rungameid/${steamAppId}`);
  send("launch", "Iniciando via Steam...", "working");

  spawn("steam", [`steam://rungameid/${steamAppId}`], {
    stdio: "ignore",
    detached: true,
  }).unref();

  send("launch", `${info?.name || steamAppId} iniciado via Steam!`, "done");
  return { success: true, method: "steam" };
}

/**
 * Launch a game with a CUSTOM prefix via proton run or umu-run directly.
 *
 * This is the key fix for the Skyrim prefix issue: when the user has a custom
 * prefix (e.g. ~/Games/Prefix/skyrim/), we MUST launch via proton run with
 * WINEPREFIX set to the custom prefix, because steam://rungameid/ would ignore
 * our prefix and use Steam's own compatdata instead — losing all DLL overrides,
 * registry entries, and mod deployments we applied.
 *
 * SKSE works fine via proton run because Proton provides steam_api.dll stubs
 * that SKSE's skse_steam_loader.dll hooks into.
 */
async function launchCustomPrefix(
  gameId: string,
  gamePath: string,
  prefixPath: string,
  steamAppId: string | undefined,
  protonPath: string,
  launchExe: string,
  launchArgs: string[],
  send: SendProgress,
): Promise<PlayResult> {
  const info = getGameInfo(gameId);
  const gameDir = path.dirname(launchExe);
  const env = buildLaunchEnv(steamAppId, gamePath, prefixPath, protonPath);

  // Get game-specific env (e.g. Skyrim sets __CV0NDEBUG etc.)
  const mod = getGameModule(gameId, gamePath);
  const customEnv = mod.getLaunchEnv?.(gamePath, prefixPath, protonPath);
  if (customEnv) Object.assign(env, customEnv);

  // For custom prefixes, never use Steam's compatdata — our prefix is standalone.
  // getLaunchEnv may set STEAM_COMPAT_DATA_PATH to the Steam compatdata dir,
  // which makes Proton wrap WINEPREFIX with /pfx/ and break our prefix layout.
  if (!isSteamCompatPrefix(prefixPath)) {
    delete env.STEAM_COMPAT_DATA_PATH;
  }

  logger.info(`[Launch] === CUSTOM PREFIX LAUNCH ===`);
  logger.info(`[Launch] gameId: ${gameId}`);
  logger.info(`[Launch] launchExe: ${launchExe}`);
  logger.info(`[Launch] WINEPREFIX: ${env.WINEPREFIX}`);
  logger.info(`[Launch] STEAM_COMPAT_DATA_PATH: ${env.STEAM_COMPAT_DATA_PATH}`);
  logger.info(`[Launch] PROTONPATH: ${env.PROTONPATH}`);
  if (steamAppId) logger.info(`[Launch] SteamAppId: ${steamAppId}`);

  killStaleWineserver();
  ensureProtonSymlink(protonPath);
  if (steamAppId) ensureSteamAppIdFile(gamePath, steamAppId);

  const protonExe = findProtonBin(protonPath);
  const umuRunPath = findUmuRun();

  if (!umuRunPath && !protonExe) {
    const msg = `Proton não encontrado em: ${protonPath}`;
    logger.error(`[Launch] ${msg}`);
    send("launch", msg, "error");
    return { success: false, error: msg };
  }

  // Try umu-run first (simpler, fewer deps), then proton run
  if (umuRunPath) {
    send("launch", `Iniciando ${path.basename(launchExe)} via umu-run (prefixo customizado)...`, "working");
    logger.info(`[Launch] Using umu-run: ${umuRunPath}`);

    return new Promise<PlayResult>((resolve) => {
      const launchEnv = { ...process.env, ...env };
      const child = spawn(umuRunPath, [launchExe, ...launchArgs], {
        cwd: gameDir,
        env: launchEnv,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      trackProcess(child);
      const stderrChunks: Buffer[] = [];
      child.stdout!.on("data", (chunk: Buffer) => { /* drain */ });
      child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      child.on("error", (err) => {
        logger.error(`[Launch] umu-run error: ${err.message}`);
        send("launch", `Erro: ${err.message}`, "error");
        resolve({ success: false, method: "proton-direct", error: err.message });
      });
      child.on("close", (code) => {
        const stderrOut = Buffer.concat(stderrChunks).toString("utf-8").trim();
        logger.info(`[Launch] umu-run exit code: ${code}`);
        if (stderrOut) logger.warn(`[Launch] umu-run stderr:\n${stderrOut}`);
      });
      child.unref();
      send("launch", `${info?.name || gameId} iniciado via umu-run!`, "done");
      resolve({ success: true, method: "proton-direct" });
    });
  }

  // Fallback: proton run
  send("launch", `Iniciando ${path.basename(launchExe)} com ${path.basename(protonPath)} (prefixo customizado)...`, "working");

  return new Promise<PlayResult>((resolve) => {
    const launchEnv = { ...process.env, ...env };
    const child = spawn(protonExe!, ["run", launchExe, ...launchArgs], {
      cwd: gameDir,
      env: launchEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    trackProcess(child);

    const stderrChunks: Buffer[] = [];
    child.stdout!.on("data", () => { /* drain */ });
    child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      logger.error(`[Launch] proton run error: ${err.message}`);
      send("launch", `Erro ao iniciar: ${err.message}`, "error");
      resolve({ success: false, method: "proton-direct", error: err.message });
    });

    child.on("close", (code) => {
      const stderrOut = Buffer.concat(stderrChunks).toString("utf-8").trim();
      logger.info(`[Launch] === PROCESS EXIT ===`);
      logger.info(`[Launch] exit code: ${code}`);
      if (stderrOut) logger.warn(`[Launch] stderr:\n${stderrOut}`);
    });

    child.unref();
    send("launch", `${info?.name || gameId} iniciado!`, "done");
    resolve({ success: true, method: "proton-direct" });
  });
}

export async function launchGame(
  gameId: string,
  gamePath: string,
  prefixPath: string,
  steamAppId: string | undefined,
  libraryPath: string | undefined,
  hasSkse: boolean,
  sksePath: string | null,
  protonPath: string,
  send: SendProgress,
): Promise<PlayResult> {
  const info = getGameInfo(gameId);
  const mod = getGameModule(gameId, gamePath);

  const launchExe = mod.getLaunchExe?.(gamePath, hasSkse, sksePath || undefined)
    || (hasSkse && sksePath ? sksePath : null)
    || (mod.preferredLaunchExe ? path.join(gamePath, mod.preferredLaunchExe) : null);

  const isSkseLaunch = hasSkse && sksePath != null;
  const launchArgs = isSkseLaunch ? [] : (mod.getLaunchArgs?.() || []);

  // ── Custom prefix: launch via proton run directly ──
  // When the user has a custom prefix (not inside Steam's compatdata),
  // we MUST launch via proton run with WINEPREFIX set to the custom prefix.
  // steam://rungameid/ would ignore our prefix and use Steam's own compatdata,
  // losing all DLL overrides, registry entries, and mod deployments.
  const customPrefix = !isSteamCompatPrefix(prefixPath);
  if (customPrefix && launchExe && fs.existsSync(launchExe)) {
    logger.info(`[Launch] Custom prefix detected: ${prefixPath}`);
    logger.info(`[Launch] Launching via proton run to use custom prefix`);
    return launchCustomPrefix(
      gameId, gamePath, prefixPath, steamAppId, protonPath,
      launchExe, launchArgs, send,
    );
  }

  // ── Steam compatdata prefix: launch via steam://rungameid/ ──
  // When the prefix IS inside Steam's compatdata, use steam://rungameid/
  // so Steam manages the Proton runtime and prefix.
  if (steamAppId) {
    ensureSteamAppIdFile(gamePath, steamAppId);
    return launchViaSteam(steamAppId, send);
  }

  // ── Fallback: Direct Proton/umu-run (non-Steam games without prefix) ──
  if (launchExe && fs.existsSync(launchExe)) {
    const gameDir = path.dirname(launchExe);
    const env = buildLaunchEnv(steamAppId, gamePath, prefixPath, protonPath);
    const customEnv = mod.getLaunchEnv?.(gamePath, prefixPath, protonPath);
    if (customEnv) Object.assign(env, customEnv);
    const launchEnv = { ...process.env, ...env };
    const protonExe = findProtonBin(protonPath);

    logger.info(`[Launch] === DIRECT LAUNCH (no Steam AppId) ===`);
    logger.info(`[Launch] gameId: ${gameId}`);
    logger.info(`[Launch] launchExe: ${launchExe}`);
    logger.info(`[Launch] WINEPREFIX: ${launchEnv.WINEPREFIX}`);

    killStaleWineserver();
    ensureProtonSymlink(protonPath);

    const umuRunPath = findUmuRun();

    if (!umuRunPath && !protonExe) {
      const msg = `Proton não encontrado em: ${protonPath}`;
      logger.error(`[Launch] ${msg}`);
      send("launch", msg, "error");
      return { success: false, error: msg };
    }

    if (umuRunPath) {
      send("launch", `Iniciando ${path.basename(launchExe)} via umu-run...`, "working");
      logger.info(`[Launch] Using umu-run: ${umuRunPath}`);

      return new Promise<PlayResult>((resolve) => {
        const child = spawn(umuRunPath, [launchExe, ...launchArgs], {
          cwd: gameDir,
          env: launchEnv,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
        });
        trackProcess(child);
        const stderrChunks: Buffer[] = [];
        child.stdout!.on("data", () => { /* drain */ });
        child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
        child.on("error", (err) => {
          logger.error(`[Launch] umu-run error: ${err.message}`);
          send("launch", `Erro: ${err.message}`, "error");
          resolve({ success: false, method: "direct", error: err.message });
        });
        child.on("close", (code) => {
          const stderrOut = Buffer.concat(stderrChunks).toString("utf-8").trim();
          logger.info(`[Launch] umu-run exit code: ${code}`);
          if (stderrOut) logger.warn(`[Launch] umu-run stderr:\n${stderrOut}`);
        });
        child.unref();
        send("launch", `${info?.name || gameId} iniciado via umu-run!`, "done");
        resolve({ success: true, method: "direct" });
      });
    }

    send("launch", `Iniciando ${path.basename(launchExe)} com ${path.basename(protonPath)}...`, "working");

    return new Promise<PlayResult>((resolve) => {
      const child = spawn(protonExe!, ["run", launchExe, ...launchArgs], {
        cwd: gameDir,
        env: launchEnv,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      trackProcess(child);

      const stderrChunks: Buffer[] = [];
      child.stdout!.on("data", () => { /* drain */ });
      child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      child.on("error", (err) => {
        logger.error(`[Launch] spawn error: ${err.message}`);
        send("launch", `Erro ao iniciar: ${err.message}`, "error");
        resolve({ success: false, method: "direct", error: err.message });
      });

      child.on("close", (code) => {
        const stderrOut = Buffer.concat(stderrChunks).toString("utf-8").trim();
        logger.info(`[Launch] === PROCESS EXIT ===`);
        logger.info(`[Launch] exit code: ${code}`);
        if (stderrOut) logger.warn(`[Launch] stderr:\n${stderrOut}`);
      });

      child.unref();
      send("launch", `${info?.name || gameId} iniciado!`, "done");
      resolve({ success: true, method: "direct" });
    });
  }

  send("launch", "Nenhum executável encontrado", "error");
  return { success: false, error: "Nenhum executável encontrado" };
}
