import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { getGameInfo, getGameModule } from "@games/registry";
import { findSteamClientPath } from "@prefix/core/steam-paths";
import { logger } from "@main/services";
import type { PlayResult, SendProgress } from "../types";

function getSteamLaunchEnv(
  steamAppId: string | undefined,
  gamePath: string,
  prefixPath: string,
  _libraryPath?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    WINEPREFIX: prefixPath,
  };

  // Detect if the prefix is inside a Steam compatdata directory
  const isSteamCompatPrefix = prefixPath.includes(path.sep + "compatdata" + path.sep);

  if (isSteamCompatPrefix) {
    // Standard Steam prefix: derive STEAM_COMPAT_DATA_PATH from the pfx path
    let compatData: string | null = null;
    if (path.basename(prefixPath) === "pfx") {
      compatData = path.dirname(prefixPath);
    } else {
      compatData = prefixPath;
    }
    if (compatData) env.STEAM_COMPAT_DATA_PATH = compatData;
  } else {
    // Custom prefix (user-configured): do NOT set STEAM_COMPAT_DATA_PATH
    // to Steam's compatdata — that would make Proton use the wrong prefix.
    // umu-run and proton respect WINEPREFIX directly.
    logger.log(`[Launch] Custom prefix detected — using WINEPREFIX only, no STEAM_COMPAT_DATA_PATH`);
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
  const env = getSteamLaunchEnv(steamAppId, gamePath, prefixPath, libraryPath);

  const customEnv = mod.getLaunchEnv?.(gamePath, prefixPath, protonPath);
  if (customEnv) Object.assign(env, customEnv);

  const launchExe = mod.getLaunchExe?.(gamePath, hasSkse, sksePath || undefined)
    || (hasSkse && sksePath ? sksePath : null)
    || (mod.preferredLaunchExe ? path.join(gamePath, mod.preferredLaunchExe) : null);

  const isSkseLaunch = hasSkse && sksePath != null;
  const launchArgs = isSkseLaunch ? [] : (mod.getLaunchArgs?.() || []);

  // Skyrim LE: RaceMenu crasha com bFull Screen=1 + DXVK.
  // Solução permanente: bBorderless=1 no SkyrimPrefs.ini (sem device reset).
  // PROTON_USE_WINED3D não funciona — WineD3D é muito lento em NVIDIA.

  if (launchExe && fs.existsSync(launchExe)) {
    const gameDir = path.dirname(launchExe);
    const launchEnv = { ...process.env, ...env };
    const protonExe = path.join(protonPath, "proton");

    logger.info(`[Launch] === LAUNCH DEBUG ===`);
    logger.info(`[Launch] gameId: ${gameId}`);
    logger.info(`[Launch] gamePath: ${gamePath}`);
    logger.info(`[Launch] prefixPath: ${prefixPath}`);
    logger.info(`[Launch] steamAppId: ${steamAppId}`);
    logger.info(`[Launch] libraryPath: ${libraryPath}`);
    logger.info(`[Launch] protonPath: ${protonPath}`);
    logger.info(`[Launch] protonExe: ${protonExe}`);
    logger.info(`[Launch] launchExe: ${launchExe}`);
    logger.info(`[Launch] launchArgs: ${JSON.stringify(launchArgs)}`);
    logger.info(`[Launch] hasSkse: ${hasSkse}, sksePath: ${sksePath}`);
    logger.info(`[Launch] WINEPREFIX: ${launchEnv.WINEPREFIX}`);
    logger.info(`[Launch] STEAM_COMPAT_DATA_PATH: ${launchEnv.STEAM_COMPAT_DATA_PATH}`);
    logger.info(`[Launch] STEAM_COMPAT_INSTALL_PATH: ${launchEnv.STEAM_COMPAT_INSTALL_PATH}`);
    logger.info(`[Launch] STEAM_COMPAT_CLIENT_INSTALL_PATH: ${launchEnv.STEAM_COMPAT_CLIENT_INSTALL_PATH}`);
    logger.info(`[Launch] SteamAppId: ${launchEnv.SteamAppId}`);
    logger.info(`[Launch] GAMEID: ${launchEnv.GAMEID}`);
    logger.info(`[Launch] protonExe exists: ${fs.existsSync(protonExe)}`);
    logger.info(`[Launch] launchExe exists: ${fs.existsSync(launchExe)}`);
    logger.info(`[Launch] gameDir: ${gameDir}`);
    logger.info(`[Launch] cwd: ${process.cwd()}`);

    // Prefer umu-run over direct Proton (umu-run handles Steam Runtime)
    const useUmu = spawnSync("which", ["umu-run"], { stdio: "pipe" }).status === 0;

    if (!useUmu && !fs.existsSync(protonExe)) {
      const msg = `Proton não encontrado em: ${protonExe}`;
      logger.error(`[Launch] ${msg}`);
      send("launch", `❌ ${msg}`, "error");
      return { success: false, error: msg };
    }

    // Kill any stale wineserver
    const killResult = spawnSync("pkill", ["-9", "wineserver"], { stdio: "pipe" });
    logger.info(`[Launch] pkill wineserver: status=${killResult.status}, stdout=${killResult.stdout.toString().trim()}, stderr=${killResult.stderr.toString().trim()}`);
    // Also try killall as fallback
    const killallResult = spawnSync("killall", ["-9", "wineserver"], { stdio: "pipe" });
    logger.info(`[Launch] killall wineserver: status=${killallResult.status}`);

    if (useUmu) {
      send("launch", `🚀 Iniciando ${path.basename(launchExe)} via umu-run...`, "working");
      logger.info(`[Launch] Using umu-run instead of direct proton`);
      return new Promise<PlayResult>((resolve) => {
        const child = spawn("umu-run", [launchExe, ...launchArgs], {
          cwd: gameDir,
          env: launchEnv,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
        });
        const stderrChunks: Buffer[] = [];
        const stdoutChunks: Buffer[] = [];
        child.stdout!.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
        child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
        child.on("error", (err) => {
          logger.error(`[Launch] umu-run error: ${err.message}`);
          send("launch", `❌ Erro: ${err.message}`, "error");
          resolve({ success: false, method: hasSkse ? "skse" : "direct", error: err.message });
        });
        child.on("close", (code) => {
          const stderrOut = Buffer.concat(stderrChunks).toString("utf-8").trim();
          const stdoutOut = Buffer.concat(stdoutChunks).toString("utf-8").trim();
          logger.info(`[Launch] umu-run exit code: ${code}`);
          if (stdoutOut) logger.info(`[Launch] umu-run stdout:\n${stdoutOut}`);
          if (stderrOut) logger.warn(`[Launch] umu-run stderr:\n${stderrOut}`);
        });
        child.unref();
        send("launch", `✅ ${info?.name || gameId} iniciado via umu-run!`, "done");
        resolve({ success: true, method: hasSkse ? "skse" : "direct" });
      });
    }

    send("launch", `🚀 Iniciando ${path.basename(launchExe)} com ${path.basename(protonPath)}...`, "working");

    return new Promise<PlayResult>((resolve) => {
      const child = spawn(protonExe, ["run", launchExe, ...launchArgs], {
        cwd: gameDir,
        env: launchEnv,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      const stderrChunks: Buffer[] = [];
      const stdoutChunks: Buffer[] = [];

      child.stdout!.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      child.on("error", (err) => {
        logger.error(`[Launch] spawn error: ${err.message}`);
        send("launch", `❌ Erro ao iniciar: ${err.message}`, "error");
        resolve({ success: false, method: hasSkse ? "skse" : "direct", error: err.message });
      });

      child.on("close", (code) => {
        const stderrOut = Buffer.concat(stderrChunks).toString("utf-8").trim();
        const stdoutOut = Buffer.concat(stdoutChunks).toString("utf-8").trim();
        logger.info(`[Launch] === PROCESS EXIT ===`);
        logger.info(`[Launch] exit code: ${code}`);
        if (stdoutOut) logger.info(`[Launch] stdout:\n${stdoutOut}`);
        if (stderrOut) logger.warn(`[Launch] stderr:\n${stderrOut}`);
      });

      child.unref();

      send("launch", `✅ ${info?.name || gameId} iniciado!`, "done");
      resolve({ success: true, method: hasSkse ? "skse" : "direct" });
    });
  }

  if (steamAppId) {
    send("launch", "🚀 Iniciando via Steam...", "working");
    spawn("steam", [`steam://rungameid/${steamAppId}`], {
      stdio: "ignore",
      detached: true,
    }).unref();
    send("launch", `✅ ${info?.name || gameId} iniciado via Steam!`, "done");
    return { success: true, method: "steam" };
  }

  send("launch", "❌ Nenhum executável encontrado", "error");
  return { success: false, error: "Nenhum executável encontrado" };
}
