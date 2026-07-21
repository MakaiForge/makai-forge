import { registerEvent } from "@main/events/register-event";
import { gamesStore } from "@main/store";

const verifyExecutablePathInUse = async (
  _event: Electron.IpcMainInvokeEvent,
  executablePath: string
) => {
  for await (const game of gamesStore.values()) {
    if (game.executablePath === executablePath) {
      return game;
    }
  }

  return null;
};

registerEvent("verifyExecutablePathInUse", verifyExecutablePathInUse);
