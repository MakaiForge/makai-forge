import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import path from "node:path";
import fs from "node:fs";
import { logger } from "@main/services";
import { app } from "electron";

export interface LaunchOptions {
  steamAppId?: string;
  exeName?: string;
  gamePath: string;
  prefixPath: string;
  protonPath?: string;
  launchCommand?: string[] | null;
}

export function findSteamCompatData(gamePath: string, steamAppId: string): string | null {
  const commonDir = path.dirname(gamePath);
  const steamappsDir = path.dirname(commonDir);
  const compatData = path.join(steamappsDir, "compatdata", steamAppId);
  return fs.existsSync(compatData) ? compatData : null;
}

export function getSteamLaunchEnv(
  steamAppId: string | undefined,
  gamePath: string,
  prefixPath: string,
  protonPath?: string,
  _platform?: string,
): Record<string, string> {
  const compatData = steamAppId
    ? findSteamCompatData(gamePath, steamAppId)
    : null;

  const env: Record<string, string> = {
    WINEPREFIX: prefixPath,
    STEAM_COMPAT_DATA_PATH: compatData || prefixPath,
  };

  if (gamePath) {
    env.STEAM_COMPAT_INSTALL_PATH = gamePath;
  }

  if (steamAppId) {
    env.SteamAppId = steamAppId;
    env.SteamGameId = steamAppId;
    env.GAMEID = steamAppId;
  }

  if (protonPath) {
    env.PROTONPATH = protonPath;
  }

  return env;
}

export function launchViaSteam(steamAppId: string): void {
  MakaiRPC.call("play_game", {
    game_id: `steam-${steamAppId}`,
    profile: "Default",
  }).catch((err: unknown) => {
    logger.error(`launchViaSteam failed: ${err}`);
  });
}

export function launchViaProton(
  exePath: string,
  protonPath: string,
  env: Record<string, string>,
): void {
  MakaiRPC.call("container_run", {
    exe_path: exePath,
    proton_path: protonPath,
    prefix_path: env.WINEPREFIX || "",
    game_path: path.dirname(exePath),
    steam_app_id: env.SteamAppId,
    env_overrides: env,
  }).catch((err: unknown) => {
    logger.error(`launchViaProton RPC failed, fallback to direct: ${err}`);
    _fallbackDirectProton(exePath, protonPath, env);
  });
}

function _fallbackDirectProton(
  exePath: string,
  protonPath: string,
  env: Record<string, string>,
): void {
  const gameDir = path.dirname(exePath);
  const { spawn } = require("node:child_process") as typeof import("node:child_process");

  let protonBin: string | null = null;
  if (protonPath && protonPath !== "umu-run") {
    const candidate = path.join(protonPath, "proton");
    if (fs.existsSync(candidate)) protonBin = candidate;
  }
  if (!protonBin) {
    const steamPath = findSteamPath();
    if (steamPath) {
      const protonDir = path.join(steamPath, "steamapps", "common");
      if (fs.existsSync(protonDir)) {
        for (const entry of fs.readdirSync(protonDir, { withFileTypes: true })) {
          if (!entry.isDirectory() || !/proton/i.test(entry.name)) continue;
          const bin = path.join(protonDir, entry.name, "proton");
          if (fs.existsSync(bin)) { protonBin = bin; break; }
        }
      }
    }
  }
  if (protonBin) {
    const launchEnv = { ...process.env, ...env, PROTON_LOG: "1" };
    spawn(protonBin, ["run", exePath], {
      cwd: gameDir, env: launchEnv, stdio: "ignore", detached: true,
    }).unref();
    return;
  }
  const bundledUmu = path.join(app.getAppPath(), "app", "_resources", "binaries", "umu-run");
  const umuBin = fs.existsSync(bundledUmu) ? bundledUmu : "umu-run";
  spawn(umuBin, [exePath], {
    cwd: gameDir, env: { ...process.env, ...env, PROTON_LOG: "1" },
    stdio: "ignore", detached: true,
  }).unref();
}

function findSteamPath(): string | null {
  const home = process.env.HOME || "/home";
  const candidates = [
    path.join(home, ".steam/steam"),
    path.join(home, ".local/share/Steam"),
    path.join(home, ".steam/root"),
    "/usr/share/steam",
    "/snap/steam/current/.steam/steam",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}
