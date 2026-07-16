import path from "node:path";
import fs from "node:fs";
import { getGameInfo, getGameModule } from "@games/registry";
import { logger } from "@main/services";
import { launchGame } from "@game-launcher/launch/launch-game";
import type { PlayResult, SendProgress } from "../types";

export function killGameProcess(): boolean {
  MakaiRPC.call("kill_game", {}).catch((err: unknown) => {
    logger.warn(`[Launch] killGameProcess RPC error: ${err}`);
  });
  return true;
}

function buildLaunchEnv(
  steamAppId: string | undefined,
  gamePath: string,
  compatDataPath: string,
  protonPath: string,
): Record<string, string> {
  const env: Record<string, string> = { PROTONPATH: protonPath };
  if (compatDataPath) {
    if (path.basename(compatDataPath) === "pfx") {
      env.STEAM_COMPAT_DATA_PATH = path.dirname(compatDataPath);
    } else {
      env.STEAM_COMPAT_DATA_PATH = compatDataPath;
    }
  }
  if (gamePath) env.STEAM_COMPAT_INSTALL_PATH = gamePath;
  if (steamAppId) {
    env.SteamAppId = steamAppId;
    env.SteamGameId = steamAppId;
    env.GAMEID = steamAppId;
  }
  return env;
}

function ensureSteamAppIdFile(gamePath: string, steamAppId: string): void {
  if (!steamAppId || !gamePath) return;
  const appIdFile = path.join(gamePath, "steam_appid.txt");
  if (!fs.existsSync(appIdFile)) {
    try { fs.writeFileSync(appIdFile, steamAppId, "utf-8"); } catch { /* ignore */ }
  }
}

export async function launchGame(
  gameId: string,
  gamePath: string,
  prefixPath: string,
  steamAppId: string | undefined,
  _libraryPath: string | undefined,
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

  if (!launchExe || !fs.existsSync(launchExe)) {
    send("launch", "Nenhum executável encontrado", "error");
    return { success: false, error: "Nenhum executável encontrado" };
  }

  const env = buildLaunchEnv(steamAppId, gamePath, prefixPath, protonPath);
  const customEnv = mod.getLaunchEnv?.(gamePath, prefixPath, protonPath);
  if (customEnv) Object.assign(env, customEnv);

  if (steamAppId) ensureSteamAppIdFile(gamePath, steamAppId);

  const launchArgs = (hasSkse && sksePath) ? [] : (mod.getLaunchArgs?.() || []);

  send("launch", `Iniciando ${path.basename(launchExe)} via Makai Time...`, "working");
  logger.info(`[Launch] === Makai Time ===`);
  logger.info(`[Launch] gameId: ${gameId}, exe: ${launchExe}`);
  logger.info(`[Launch] WINEPREFIX: ${prefixPath}`);

  try {
    const result = await launchGame({
      exePath: launchExe,
      prefixPath,
      protonPath,
      gamePath: path.dirname(launchExe),
      envOverrides: env,
    });

    if (result.success) {
      send("launch", `${info?.name || gameId} iniciado via Makai Time!`, "done");
    } else {
      send("launch", result.error || "Falha ao iniciar", "error");
    }
    return { success: result.success, method: "makai_time" };
  } catch (err) {
    const msg = `Makai Time falhou: ${String(err).slice(0, 200)}`;
    logger.error(`[Launch] ${msg}`);
    send("launch", msg, "error");
    return { success: false, error: msg, method: "makai_time" };
  }
}
