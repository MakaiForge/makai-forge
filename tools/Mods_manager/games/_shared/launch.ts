import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { logger } from "@main/services";

export interface LaunchOptions {
  steamAppId?: string
  exeName?: string
  gamePath: string
  prefixPath: string
  protonPath?: string
  launchCommand?: string[] | null
}

function findSteamCompatData(gamePath: string, steamAppId: string): string | null {
  const commonDir = path.dirname(gamePath); // .../steamapps/common
  const steamappsDir = path.dirname(commonDir); // .../steamapps
  const compatData = path.join(steamappsDir, "compatdata", steamAppId);
  return fs.existsSync(compatData) ? compatData : null;
}

export function getSteamLaunchEnv(
  steamAppId: string | undefined,
  gamePath: string,
  prefixPath: string,
  protonPath?: string,
  platform?: string,
): Record<string, string> {
  // For Steam games, use the Steam compatdata as STEAM_COMPAT_DATA_PATH
  const compatData = steamAppId
    ? findSteamCompatData(gamePath, steamAppId)
    : null;

  const env: Record<string, string> = {
    WINEPREFIX: prefixPath,
    STEAM_COMPAT_DATA_PATH: compatData || prefixPath,
  };

  const steamPath = findSteamPath(platform);
  if (steamPath) {
    env.STEAM_COMPAT_CLIENT_INSTALL_PATH = steamPath;
  }

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

function findSteamPath(platform?: string): string | null {
  const home = process.env.HOME || "/home";
  const candidates: string[] = [];

  if (platform === "darwin") {
    candidates.push(
      path.join(home, "Library/Application Support/Steam"),
      "/Applications/Steam.app/Contents/MacOS",
    );
  } else {
    candidates.push(
      path.join(home, ".steam/steam"),
      path.join(home, ".local/share/Steam"),
      path.join(home, ".steam/root"),
      "/usr/share/steam",
      "/snap/steam/current/.steam/steam",
    );
  }

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

export function launchViaSteam(steamAppId: string): void {
  const url = `steam://rungameid/${steamAppId}`;
  const candidates = [
    ["steam", url],
    ["xdg-open", url],
  ];

  for (const cmd of candidates) {
    try {
      spawn(cmd[0], cmd.slice(1), {
        stdio: "ignore",
        detached: true,
      }).unref();
      return;
    } catch { /* try next */ }
  }
}

function findSteamProton(): string | null {
  const steamPath = findSteamPath();
  if (!steamPath) return null;

  const protonDir = path.join(steamPath, "steamapps", "common");
  if (!fs.existsSync(protonDir)) return null;

  const entries = fs.readdirSync(protonDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/proton/i.test(entry.name)) continue;
    const protonBin = path.join(protonDir, entry.name, "proton");
    if (fs.existsSync(protonBin)) return protonBin;
  }
  return null;
}

export function launchViaProton(
  exePath: string,
  protonPath: string,
  env: Record<string, string>,
): void {
  const gameDir = path.dirname(exePath);

  // Enable Proton debug logging
  const launchEnv = {
    ...process.env,
    ...env,
    PROTON_LOG: "1",
  };

  let protonBin: string | null = null;

  if (protonPath && protonPath !== "umu-run") {
    const candidate = path.join(protonPath, "proton");
    if (fs.existsSync(candidate)) protonBin = candidate;
  }

  if (!protonBin) {
    protonBin = findSteamProton();
  }

  if (protonBin) {
    try {
      logger.info(`Launching: ${protonBin} run ${exePath}`);
      logger.info(`CWD: ${gameDir}`);
      logger.info(`SteamAppId: ${launchEnv.SteamAppId}`);
      spawn(protonBin, ["run", exePath], {
        cwd: gameDir,
        env: launchEnv,
        stdio: "ignore",
        detached: true,
      }).unref();
    } catch (err) {
      logger.error(`Launch failed: ${err}`);
    }
    return;
  }

  // Fallback: umu-run (bundled in tools/prefix/)
  try {
    const bundledUmu = path.join(app.getAppPath(), "tools", "prefix", "umu-run");
    const umuBin = fs.existsSync(bundledUmu) ? bundledUmu : "umu-run";
    logger.info(`Launching via umu-run: ${exePath}`);
    spawn(umuBin, [exePath], {
      cwd: gameDir,
      env: launchEnv,
      stdio: "ignore",
      detached: true,
    }).unref();
  } catch (err) {
    logger.error(`umu-run failed: ${err}`);
  }
}
