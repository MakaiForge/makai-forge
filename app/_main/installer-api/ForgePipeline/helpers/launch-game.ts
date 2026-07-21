import { shell } from "electron";
import path from "node:path";
import { spawn } from "node:child_process";
import { GameShop, type UserPreferences, type Game } from "@types";
import { db, gamesStore, storeKeys } from "@main/store";
import {
  logger,
  PowerSaveBlockerManager,
  Wine,
  NativeAddon,
  Umu,
} from "@main/services";
import { launchGameDetached } from "@game-launcher/launch/launch-game";
import { GameLogManager } from "@games-ui/services/game-log-manager";
import { checkAndCreateWinePrefix } from "@container/core/init";

import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { isGamemodeAvailable } from "@main/helpers/is-gamemode-available";
import { isMangohudAvailable } from "@main/helpers/is-mangohud-available";
import { resolveLaunchCommand } from "@main/helpers/resolve-launch-command";

export interface LaunchGameOptions {
  shop: GameShop;
  objectId: string;
  executablePath: string;
  launchOptions?: string | null;
}

const isWindowsExecutable = (executablePath: string) =>
  path.extname(executablePath).toLowerCase() === ".exe";

const launchNatively = (
  executablePath: string,
  launchOptions?: string | null,
  useMangohud = false,
  useGamemode = false
) => {
  const workingDirectory = path.dirname(executablePath);
  const resolvedLaunchCommand = resolveLaunchCommand({
    baseCommand: executablePath,
    launchOptions,
    wrapperCommands: [
      ...(useGamemode ? ["gamemoderun"] : []),
      ...(useMangohud ? ["mangohud"] : []),
    ],
  });

  if (
    resolvedLaunchCommand.command === executablePath &&
    resolvedLaunchCommand.args.length === 0 &&
    Object.keys(resolvedLaunchCommand.env).length === 0
  ) {
    shell.openPath(executablePath);
    return;
  }

  const processRef = spawn(
    resolvedLaunchCommand.command,
    resolvedLaunchCommand.args,
    {
      shell: false,
      detached: true,
      stdio: "ignore",
      cwd: workingDirectory,
      env: {
        ...process.env,
        ...resolvedLaunchCommand.env,
      },
    }
  );

  processRef.unref();
};

const launchWithWine = async (
  executablePath: string,
  launchOptions?: string | null,
  useMangohud = false,
  useGamemode = false,
  customEnv?: Record<string, string>,
  winePrefixPath?: string | null
): Promise<boolean> => {
  const workingDirectory = path.dirname(executablePath);
  const resolvedLaunchCommand = resolveLaunchCommand({
    baseCommand: "wine",
    baseArgs: [executablePath],
    launchOptions,
    wrapperCommands: [
      ...(useGamemode ? ["gamemoderun"] : []),
      ...(useMangohud ? ["mangohud"] : []),
    ],
  });

  return await new Promise<boolean>((resolve) => {
    const processRef = spawn(
      resolvedLaunchCommand.command,
      resolvedLaunchCommand.args,
      {
        shell: false,
        detached: true,
        stdio: "ignore",
        cwd: workingDirectory,
        env: {
          ...process.env,
          ...(winePrefixPath ? { WINEPREFIX: winePrefixPath } : {}),
          ...resolvedLaunchCommand.env,
          ...customEnv,
        },
      }
    );

    processRef.once("spawn", () => {
      processRef.unref();
      resolve(true);
    });

    processRef.once("error", (error) => {
      logger.error("Failed to launch game with Wine", error);
      resolve(false);
    });
  });
};

const resolveProtonPathForLaunch = async (
  gameProtonPath?: string | null
): Promise<string | null> => {
  if (gameProtonPath && Umu.isValidProtonPath(gameProtonPath)) {
    return gameProtonPath;
  }

  const userPreferences = await db
    .get<string, UserPreferences | null>(storeKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const defaultProtonPath = userPreferences?.defaultProtonPath;

  if (defaultProtonPath && Umu.isValidProtonPath(defaultProtonPath)) {
    return defaultProtonPath;
  }

  return null;
};

const cleanupStaleCompatibilityProcesses = async (
  objectId: string,
  winePrefixPath: string | null
) => {
  if (process.platform !== "linux" || !winePrefixPath) return;

  const defaultPrefixPath = Wine.getDefaultPrefixPathForGame(objectId);
  if (defaultPrefixPath !== winePrefixPath) return;

  const processes = await NativeAddon.listProcesses();

  const stalePids = processes
    .filter((runningProcess) => {
      const processPrefix = runningProcess.environ?.STEAM_COMPAT_DATA_PATH;
      if (processPrefix !== winePrefixPath) return false;

      const processExe = runningProcess.exe?.toLowerCase() ?? "";
      const processName = runningProcess.name.toLowerCase();

      return (
        processExe.includes("wine") ||
        processName.endsWith(".exe") ||
        processName === "wineserver"
      );
    })
    .map((runningProcess) => runningProcess.pid);

  if (!stalePids.length) return;

  logger.info("Killing stale compatibility processes before game launch", {
    objectId,
    winePrefixPath,
    stalePids,
  });

  for (const pid of stalePids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore races and missing permissions.
    }
  }
};

/**
 * Shows the launcher window and launches the game executable
 * Shared between deep link handler and openGame event
 */
export const launchGame = async (options: LaunchGameOptions): Promise<void> => {
  const { shop, objectId, executablePath, launchOptions } = options;

  const parsedPath = parseExecutablePath(executablePath);

  const gameKey = storeKeys.game(shop, objectId);
  let game = await gamesStore.get(gameKey);

  // For Steam games, check for custom config stored in appDb
  if (!game && shop === "steam") {
    const steamConfig = await db
      .get(`steam_config:${objectId}`, { valueEncoding: "json" })
      .catch(() => null);
    if (steamConfig) {
      game = {
        objectId,
        shop: "steam",
        title: steamConfig.title || "",
        protonPath: steamConfig.protonPath || null,
        winePrefixPath: steamConfig.winePrefixPath || null,
        autoRunMangohud: steamConfig.autoRunMangohud || false,
        autoRunGamemode: steamConfig.autoRunGamemode || false,
        dxvk: steamConfig.dxvk || false,
        esync: steamConfig.esync || false,
        fsync: steamConfig.fsync || false,
        enableEac: steamConfig.enableEac || false,
        enableBattlEye: steamConfig.enableBattlEye || false,
        env: steamConfig.env || undefined,
      } as Game;
    }
  }

  const userPreferences = await db
    .get<string, UserPreferences | null>(storeKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const useMangohud =
    (userPreferences?.autoRunMangohud === true ||
      game?.autoRunMangohud === true) &&
    isMangohudAvailable();

  const useGamemode =
    (userPreferences?.autoRunGamemode === true ||
      game?.autoRunGamemode === true) &&
    isGamemodeAvailable();

  if (game) {
    await gamesStore.put(gameKey, {
      ...game,
      executablePath: parsedPath,
      launchOptions,
    });
  }

  if (process.platform === "linux") {
    const isWindowsBinary = isWindowsExecutable(parsedPath);

    if (isWindowsBinary) {
      const protonPath = await resolveProtonPathForLaunch(game?.protonPath);
      const winePrefixPath = Wine.getEffectivePrefixPath(
        game?.winePrefixPath,
        objectId
      );

      if (winePrefixPath) {
        const prefixCreated = await checkAndCreateWinePrefix(
          winePrefixPath,
          protonPath
        );
        if (!prefixCreated) {
          logger.warn("Failed to create Wine prefix, continuing anyway", {
            winePrefixPath,
          });
        }
      }

      await cleanupStaleCompatibilityProcesses(objectId, winePrefixPath);

      const gameEnv: Record<string, string> = {};

      if (game?.dxvk) {
        gameEnv.DXVK_ENABLE = "1";
        if (game.dxvkVersion) {
          gameEnv.DXVK_STATE_CACHE = "1";
        }
        if (game.dxvkAsync) {
          gameEnv.DXVK_ASYNC = "1";
        }
      }

      if (game?.esync) {
        gameEnv.WINEESYNC = "1";
      }

      if (game?.fsync) {
        gameEnv.WINEFSYNC = "1";
      }

      if (game?.env) {
        Object.assign(gameEnv, game.env);
      }

      if (game?.enableEac) {
        gameEnv.PROTON_EAC_ENABLE = "1";
      }

      if (game?.enableBattlEye) {
        gameEnv.PROTON_BATTLEYE_ENABLE = "1";
      }

      // .NET apphost reads DOTNET_ROOT from process environment, not Wine registry
      // Without it, .NET apps fail with aka.ms/dotnet-core-applaunch
      if (winePrefixPath) {
        gameEnv.DOTNET_ROOT = "C:\\Program Files\\dotnet";
        gameEnv["DOTNET_ROOT(x86)"] = "C:\\Program Files (x86)\\dotnet";
      }

      if (!protonPath || !winePrefixPath) {
        logger.warn("Makrun: missing protonPath or winePrefixPath, falling back to native launch");
        launchNatively(parsedPath, launchOptions, useMangohud, useGamemode);
        return;
      }

      try {
        launchGameDetached({
          exePath: parsedPath,
          prefixPath: winePrefixPath,
          protonPath,
          gamePath: path.dirname(parsedPath),
          envOverrides: gameEnv,
          onLog: (line) => GameLogManager.append(shop, objectId, line),
        });
        PowerSaveBlockerManager.markCompatibilityLaunchStarted(gameKey);
        return;
      } catch (error) {
        logger.error("Failed to launch game with Makai Time", error);
      }
    }

    launchNatively(parsedPath, launchOptions, useMangohud, useGamemode);
    return;
  }

  launchNatively(parsedPath, launchOptions, useMangohud, useGamemode);
};
