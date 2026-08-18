import { WindowManager } from "@main/services/window-manager";
import { createGame, trackGamePlaytime } from "@main/services/library-sync";
import type { Game, GameRunning, UserPreferences } from "@types";
import axios from "axios";
import { app } from "electron";
import { db, gamesStore, storeKeys } from "@main/store";
import { CloudSync } from "@main/services/cloud-sync";
import { logger, networkLogger } from "@main/services/logger";
import { PowerSaveBlockerManager } from "@main/services/power-save-blocker";
import path from "node:path";
import { INTERVALS } from "@main/constants";
import { Wine } from "@provision/ForgePipeline/services/wine";
import { NativeAddon } from "@main/services/native-addon";
import sudo from "sudo-prompt";

export const gamesPlaytime = new Map<
  string,
  { lastTick: number; firstTick: number; lastSyncTick: number }
>();

interface ExecutableInfo {
  name: string;
  os: string;
  exe: string;
}

interface GameExecutables {
  [key: string]: ExecutableInfo[];
}

interface LinuxProcessInfo {
  name: string;
  cwd: string;
  exe: string;
  steamCompatDataPath: string | null;
}

const TICKS_TO_UPDATE_API = (3 * 60 * 1000) / INTERVALS.processWatcher; // 3 minutes
let currentTick = 1;

const platform = process.platform;

const logPlaytimeTrace = (
  event: string,
  game: Game,
  payload?: Record<string, unknown>
) => {
  networkLogger.info("[playtime-trace]", event, {
    gameKey: storeKeys.game(game.shop, game.objectId),
    shop: game.shop,
    objectId: game.objectId,
    remoteId: game.remoteId,
    localPlayTimeInMilliseconds: Math.trunc(game.playTimeInMilliseconds ?? 0),
    unsyncedDeltaPlayTimeInMilliseconds:
      game.unsyncedDeltaPlayTimeInMilliseconds ?? 0,
    lastTimePlayed:
      game.lastTimePlayed instanceof Date
        ? game.lastTimePlayed.toISOString()
        : game.lastTimePlayed,
    ...payload,
  });
};

const getGameExecutables = async () => {
  const gameExecutables = (
    await axios
      .get(
        import.meta.env.MAIN_VITE_EXTERNAL_RESOURCES_URL +
          "/game-executables.json"
      )
      .catch(() => {
        return { data: {} };
      })
  ).data as GameExecutables;

  Object.keys(gameExecutables).forEach((key) => {
    gameExecutables[key] = gameExecutables[key]
      .filter((executable) => {
        if (platform === "win32") {
          return executable.os === "win32";
        } else if (platform === "linux") {
          return executable.os === "linux" || executable.os === "win32";
        }

        return false;
      })
      .map((executable) => {
        return {
          name:
            platform === "win32"
              ? executable.name.replace(/\//g, "\\")
              : executable.name,
          os: executable.os,
          exe: executable.name.slice(executable.name.lastIndexOf("/") + 1),
        };
      });
  });

  return gameExecutables;
};

export const gameExecutables = await getGameExecutables();

const findGamePathByProcess = async (
  processMap: Map<string, Set<string>>,
  winePrefixMap: Map<string, string>,
  gameId: string
) => {
  const executables = gameExecutables[gameId];

  for (const executable of executables) {
    const executablewithoutExtension = executable.exe.replace(/\.exe$/i, "");

    const pathSet =
      processMap.get(executable.exe) ??
      processMap.get(executablewithoutExtension);

    if (pathSet) {
      for (const path of pathSet) {
        if (
          path.toLowerCase().endsWith(executable.name) ||
          path.toLowerCase().endsWith(executablewithoutExtension)
        ) {
          const gameKey = storeKeys.game("steam", gameId);
          const game = await gamesStore.get(gameKey);

          if (game) {
            const updatedGame: Game = {
              ...game,
              executablePath: path,
            };

            if (process.platform === "linux" && winePrefixMap.has(path)) {
              updatedGame.winePrefixPath = winePrefixMap.get(path)!;
            }

            await gamesStore.put(gameKey, updatedGame);
            logger.info("Set game path", gameKey, path);
          }
        }
      }
    }
  }
};

const getSystemProcessMap = async () => {
  const {
    processMap: rawMap,
    winePrefixMap: rawWineMap,
    linuxProcesses,
  } = await NativeAddon.getSystemProcessMap();

  const processMap = new Map<string, Set<string>>(
    Object.entries(rawMap).map(([k, v]) => [k, new Set(v)])
  );

  const winePrefixMap = new Map<string, string>(Object.entries(rawWineMap));

  return { processMap, winePrefixMap, linuxProcesses };
};

const hasLinuxCompatibilityProcessMatch = (
  game: Game,
  executablePath: string,
  linuxProcesses: LinuxProcessInfo[]
) => {
  if (path.extname(executablePath).toLowerCase() !== ".exe") {
    return false;
  }

  const executableName = path.basename(executablePath).toLowerCase();
  const executableNameWithoutExtension = executableName.replace(/\.exe$/i, "");
  const executableDirectory = path.dirname(executablePath).toLowerCase();
  const expectedWinePrefix = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    game.objectId
  )?.toLowerCase();

  return linuxProcesses.some((process) => {
    if (process.cwd !== executableDirectory) {
      return false;
    }

    if (
      expectedWinePrefix &&
      process.steamCompatDataPath &&
      process.steamCompatDataPath !== expectedWinePrefix
    ) {
      return false;
    }

    if (
      process.name === executableName ||
      process.name === executableNameWithoutExtension
    ) {
      return true;
    }

    const processRunsUnderWine = process.exe.includes("wine");

    return processRunsUnderWine && process.name.length > 0;
  });
};

export const watchProcesses = async () => {
  const games = await gamesStore
    .values()
    .all()
    .then((results) => {
      return results.filter((game) => game.isDeleted === false);
    });

  if (!games.length) return;

  const { processMap, winePrefixMap, linuxProcesses } =
    await getSystemProcessMap();

  for (const game of games) {
    const gameKey = storeKeys.game(game.shop, game.objectId);
    const executablePath = game.executablePath;
    if (!executablePath) {
      if (gameExecutables[game.objectId]) {
        await findGamePathByProcess(processMap, winePrefixMap, game.objectId);
      }

      continue;
    }

    const executable = executablePath
      .slice(executablePath.lastIndexOf(platform === "win32" ? "\\" : "/") + 1)
      .toLowerCase();

    let hasProcess = processMap.get(executable)?.has(executablePath) ?? false;

    if (!hasProcess && platform === "linux") {
      hasProcess = hasLinuxCompatibilityProcessMatch(
        game,
        executablePath,
        linuxProcesses
      );
    }

    if (hasProcess) {
      if (gamesPlaytime.has(gameKey)) {
        onTickGame(game);
      } else {
        onOpenGame(game);
      }
    } else if (gamesPlaytime.has(gameKey)) {
      onCloseGame(game);
    }
  }

  currentTick++;

  if (WindowManager.mainWindow) {
    const gamesRunning = Array.from(gamesPlaytime.entries()).map((entry) => {
      return {
        id: entry[0],
        sessionDurationInMillis: performance.now() - entry[1].firstTick,
      } as Pick<GameRunning, "id" | "sessionDurationInMillis">;
    });

    WindowManager.mainWindow.webContents.send("on-games-running", gamesRunning);
  }
};

function onOpenGame(game: Game) {
  const now = performance.now();
  const gameKey = storeKeys.game(game.shop, game.objectId);

  gamesPlaytime.set(gameKey, {
    lastTick: now,
    firstTick: now,
    lastSyncTick: now,
  });

  logPlaytimeTrace("session-open", game, {
    performanceNow: now,
  });

  WindowManager.closeGameLauncherWindow();

  // Hide ProtonForge to tray on game startup if enabled
  db.get<string, UserPreferences | null>(storeKeys.userPreferences, {
    valueEncoding: "json",
  })
    .then((userPreferences) => {
      if (userPreferences?.hideToTrayOnGameStart) {
        WindowManager.mainWindow?.hide();
      }
    })
    .catch(() => {});

  if (game.shop !== "steam") return;

  if (game.remoteId) {
    const deltaToSync = game.unsyncedDeltaPlayTimeInMilliseconds ?? 0;
    const syncTimestamp = new Date();

    logPlaytimeTrace("open-sync-track-request", game, {
      deltaToSync,
      syncTimestamp: syncTimestamp.toISOString(),
    });

    trackGamePlaytime(game, deltaToSync, syncTimestamp)
      .then(() => {
        logPlaytimeTrace("open-sync-track-success", game, {
          deltaToSync,
        });

        gamesStore.put(gameKey, {
          ...game,
          unsyncedDeltaPlayTimeInMilliseconds: 0,
        });
      })
      .catch((error) => {
        logPlaytimeTrace("open-sync-track-failed", game, {
          deltaToSync,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    if (game.automaticCloudSync) {
      CloudSync.uploadSaveGame(
        game.objectId,
        game.shop,
        null,
        CloudSync.getBackupLabel(true)
      );
    }
  } else {
    const payload = { ...game, lastTimePlayed: new Date() };

    logPlaytimeTrace("open-sync-create-request", payload, {
      syncTimestamp:
        payload.lastTimePlayed instanceof Date
          ? payload.lastTimePlayed.toISOString()
          : payload.lastTimePlayed,
    });

    createGame(payload)
      .then(() => {
        logPlaytimeTrace("open-sync-create-success", payload);
      })
      .catch((error) => {
        logPlaytimeTrace("open-sync-create-failed", payload, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}

function onTickGame(game: Game) {
  const now = performance.now();
  const gamePlaytime = gamesPlaytime.get(
    storeKeys.game(game.shop, game.objectId)
  )!;

  const delta = now - gamePlaytime.lastTick;

  const updatedGame: Game = {
    ...game,
    playTimeInMilliseconds: (game.playTimeInMilliseconds ?? 0) + delta,
    lastTimePlayed: new Date(),
  };

  gamesStore.put(storeKeys.game(game.shop, game.objectId), updatedGame);

  gamesPlaytime.set(storeKeys.game(game.shop, game.objectId), {
    ...gamePlaytime,
    lastTick: now,
  });

  if (currentTick % TICKS_TO_UPDATE_API === 0 && game.shop === "steam") {
    const deltaToSync =
      now -
      gamePlaytime.lastSyncTick +
      (game.unsyncedDeltaPlayTimeInMilliseconds ?? 0);

    logPlaytimeTrace("periodic-sync-request", game, {
      method: game.remoteId ? "track" : "create",
      deltaToSync,
      performanceNow: now,
      lastSyncTick: gamePlaytime.lastSyncTick,
      lastTick: gamePlaytime.lastTick,
    });

    const gamePromise = game.remoteId
      ? trackGamePlaytime(game, deltaToSync, game.lastTimePlayed!)
      : createGame(game);

    gamePromise
      .then(() => {
        logPlaytimeTrace("periodic-sync-success", game, {
          method: game.remoteId ? "track" : "create",
          deltaToSync,
        });

        gamesStore.put(storeKeys.game(game.shop, game.objectId), {
          ...updatedGame,
          unsyncedDeltaPlayTimeInMilliseconds: 0,
        });

        // Só atualiza lastSyncTick no SUCESSO — no fracasso, o delta continua
        // acumulado em unsyncedDeltaPlayTimeInMilliseconds para reintentar
        gamesPlaytime.set(storeKeys.game(game.shop, game.objectId), {
          ...gamePlaytime,
          lastTick: now,
          lastSyncTick: now,
        });
      })
      .catch((error) => {
        logPlaytimeTrace("periodic-sync-failed", game, {
          method: game.remoteId ? "track" : "create",
          deltaToSync,
          error: error instanceof Error ? error.message : String(error),
        });

        // No fracasso: NÃO atualiza lastSyncTick — o delta falhado continua
        // pendente em unsyncedDeltaPlayTimeInMilliseconds para o próximo ciclo
        gamesStore.put(storeKeys.game(game.shop, game.objectId), {
          ...updatedGame,
          unsyncedDeltaPlayTimeInMilliseconds: deltaToSync,
        });

        // Apenas atualiza lastTick (não lastSyncTick)
        gamesPlaytime.set(storeKeys.game(game.shop, game.objectId), {
          ...gamePlaytime,
          lastTick: now,
        });
      });
  }
}

const onCloseGame = (game: Game) => {
  const gameKey = storeKeys.game(game.shop, game.objectId);
  const now = performance.now();
  const gamePlaytime = gamesPlaytime.get(gameKey)!;
  gamesPlaytime.delete(gameKey);
  PowerSaveBlockerManager.markGameClosed(gameKey);

  const delta = now - gamePlaytime.lastTick;

  logPlaytimeTrace("session-close", game, {
    performanceNow: now,
    delta,
    firstTick: gamePlaytime.firstTick,
    lastTick: gamePlaytime.lastTick,
    lastSyncTick: gamePlaytime.lastSyncTick,
  });

  const updatedGame: Game = {
    ...game,
    playTimeInMilliseconds: (game.playTimeInMilliseconds ?? 0) + delta,
    lastTimePlayed: new Date(),
  };

  gamesStore.put(gameKey, updatedGame);

  if (game.shop !== "steam") return;

  if (game.remoteId) {
    if (game.automaticCloudSync) {
      CloudSync.uploadSaveGame(
        game.objectId,
        game.shop,
        null,
        CloudSync.getBackupLabel(true)
      );
    }

    const deltaToSync =
      now -
      gamePlaytime.lastSyncTick +
      (game.unsyncedDeltaPlayTimeInMilliseconds ?? 0);

    logPlaytimeTrace("close-sync-track-request", game, {
      deltaToSync,
      syncTimestamp:
        game.lastTimePlayed instanceof Date
          ? game.lastTimePlayed.toISOString()
          : game.lastTimePlayed,
    });

    return trackGamePlaytime(game, deltaToSync, game.lastTimePlayed!)
      .then(() => {
        logPlaytimeTrace("close-sync-track-success", game, {
          deltaToSync,
        });

        return gamesStore.put(gameKey, {
          ...updatedGame,
          unsyncedDeltaPlayTimeInMilliseconds: 0,
        });
      })
      .catch((error) => {
        logPlaytimeTrace("close-sync-track-failed", game, {
          deltaToSync,
          error: error instanceof Error ? error.message : String(error),
        });

        return gamesStore.put(gameKey, {
          ...updatedGame,
          unsyncedDeltaPlayTimeInMilliseconds: deltaToSync,
        });
      });
  } else {
    logPlaytimeTrace("close-sync-create-request", game, {
      syncTimestamp:
        game.lastTimePlayed instanceof Date
          ? game.lastTimePlayed.toISOString()
          : game.lastTimePlayed,
    });

    return createGame(game)
      .then(() => {
        logPlaytimeTrace("close-sync-create-success", game);
      })
      .catch((error) => {
        logPlaytimeTrace("close-sync-create-failed", game, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
};

export const clearGamesPlaytime = async () => {
  for (const game of gamesPlaytime.keys()) {
    const gameData = await gamesStore.get(game);

    if (gameData) {
      await onCloseGame(gameData);
    }
  }

  gamesPlaytime.clear();
};

const getKillCommand = (pid: number) => {
  if (process.platform == "win32") {
    return `taskkill /PID ${pid}`;
  }
  return `kill -9 ${pid}`;
};

const killProcess = (pid: number) => {
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }

  try {
    process.kill(pid);
  } catch {
    sudo.exec(getKillCommand(pid), { name: app.getName() }, (error) => {
      if (error) {
        logger.warn("Failed to kill process", { pid });
      }
    });
  }
};

export const killRunningGameProcesses = async () => {
  const processes = await NativeAddon.listProcesses();
  const pidsToKill: number[] = [];

  for (const gameKey of gamesPlaytime.keys()) {
    const gameData = await gamesStore.get(gameKey);
    if (!gameData) continue;

    const winePrefixPath = Wine.getEffectivePrefixPath(
      gameData.winePrefixPath,
      gameData.objectId
    );

    for (const runningProcess of processes) {
      if (process.platform !== "linux") continue;

      const exeLower = runningProcess.exe?.toLowerCase() ?? "";
      const nameLower = runningProcess.name.toLowerCase();
      const processPrefix =
        runningProcess.environ?.STEAM_COMPAT_DATA_PATH?.toLowerCase();

      const isGameProcess =
        gameData.executablePath &&
        nameLower === gameData.executablePath.split("/").at(-1);

      const isWineProcess =
        exeLower.includes("wine") ||
        exeLower.includes("wineserver") ||
        exeLower.includes("proton");

      const isInPrefix =
        winePrefixPath && processPrefix === winePrefixPath.toLowerCase();

      if (isGameProcess || (isWineProcess && isInPrefix)) {
        pidsToKill.push(runningProcess.pid);
      }
    }
  }

  const uniquePids = [...new Set(pidsToKill)];
  for (const pid of uniquePids) {
    killProcess(pid);
  }

  if (uniquePids.length > 0) {
    logger.info("Killed running game processes on quit", {
      count: uniquePids.length,
      pids: uniquePids,
    });
  }
};
