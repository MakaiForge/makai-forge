import { registerEvent } from "@main/events/register-event";
import { logger, Wine, WindowManager } from "@main/services";
import sudo from "sudo-prompt";
import { app } from "electron";
import { gamesStore, storeKeys } from "@main/store";
import { GameShop } from "@types";
import { NativeAddon } from "@main/services/native-addon";

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
  } catch (err) {
    sudo.exec(getKillCommand(pid), { name: app.getName() }, (error) => {
      if (error) {
        logger.error("Failed to kill process", error);
      }
    });
  }
};

const closeGame = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const processes = await NativeAddon.listProcesses();

  const game = await gamesStore.get(storeKeys.game(shop, objectId));

  if (!game) return;

  const winePrefixPath = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    game.objectId
  );

  const processesToKill: number[] = [];

  for (const runningProcess of processes) {
    if (process.platform === "linux") {
      const exeLower = runningProcess.exe?.toLowerCase() ?? "";
      const nameLower = runningProcess.name.toLowerCase();
      const processPrefix =
        runningProcess.environ?.STEAM_COMPAT_DATA_PATH?.toLowerCase();

      const isGameProcess =
        game.executablePath &&
        nameLower === game.executablePath.split("/").at(-1);

      const isWineProcess =
        exeLower.includes("wine") ||
        exeLower.includes("wineserver") ||
        exeLower.includes("proton");

      const isInPrefix =
        winePrefixPath && processPrefix === winePrefixPath.toLowerCase();

      if (isGameProcess || (isWineProcess && isInPrefix)) {
        processesToKill.push(runningProcess.pid);
      }
    }
  }

  for (const pid of processesToKill) {
    killProcess(pid);
  }

  if (processesToKill.length > 0) {
    logger.info("Killed processes in Wine prefix", {
      prefixPath: winePrefixPath,
      pids: processesToKill,
    });
  }

  WindowManager.closeGameLauncherWindow();
};

registerEvent("closeGame", closeGame);
