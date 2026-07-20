import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { Umu } from "@main/services";
import type { GameShop } from "@types";

const getGamesFolder = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "games");
};

const saveGameJson = async (
  objectId: string,
  gameData: Record<string, unknown>
) => {
  const folder = getGamesFolder();
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const filePath = path.join(folder, `${objectId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2), "utf-8");
};

const selectGameProtonPath = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  protonPath: string | null
) => {
  const gameKey = storeKeys.game(shop, objectId);

  const game = await gamesStore.get(gameKey);

  if (!game) return;

  if (!protonPath) {
    const updatedGame = {
      ...game,
      protonPath: null,
    };
    await gamesStore.put(gameKey, updatedGame);
    await saveGameJson(objectId, updatedGame);
    return;
  }

  const realProtonPath = await fs.promises.realpath(protonPath);

  if (!Umu.isValidProtonPath(realProtonPath)) {
    throw new Error("Invalid proton path");
  }

  const protonVersion = path.basename(realProtonPath);

  const updatedGame = {
    ...game,
    protonPath: realProtonPath,
    protonVersion,
  };
  await gamesStore.put(gameKey, updatedGame);
  await saveGameJson(objectId, updatedGame);
};

registerEvent("selectGameProtonPath", selectGameProtonPath);
