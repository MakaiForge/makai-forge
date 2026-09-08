import path from "node:path";
import { registerEvent } from "@main/events/register-event";
import { scanSteamLibrary } from "@main/services/steam-scanner";
import { gamesStore, storeKeys } from "@main/store";
import { getSteamGameProton } from "@main/services/steam-config-vdf";
import type { GameShop } from "@types";

registerEvent("syncSteamLibrary", async () => {
  const games = await scanSteamLibrary();

  for (const game of games) {
    const gameKey = storeKeys.game("steam", game.appId);
    const existing = await gamesStore.get(gameKey).catch(() => null);
    const protonConfig = await getSteamGameProton(game.appId);

    if (existing) {
      existing.executablePath = game.executablePath ?? existing.executablePath;
      existing.winePrefixPath = game.compatDataPath
        ? path.join(game.compatDataPath, "pfx")
        : existing.winePrefixPath;
      existing.installedSizeInBytes = game.sizeOnDisk;
      if (protonConfig) {
        existing.protonVersion = protonConfig.name;
      }
      await gamesStore.put(gameKey, existing);
    } else {
      const newGame = {
        title: game.name,
        iconUrl: null,
        libraryHeroImageUrl: null,
        logoImageUrl: null,
        objectId: game.appId,
        shop: "steam" as GameShop,
        remoteId: null,
        isDeleted: false,
        playTimeInMilliseconds: 0,
        lastTimePlayed: null,
        executablePath: game.executablePath ?? null,
        winePrefixPath: game.compatDataPath
          ? path.join(game.compatDataPath, "pfx")
          : null,
        installedSizeInBytes: game.sizeOnDisk,
        protonVersion: protonConfig?.name ?? null,
      };
      await gamesStore.put(gameKey, newGame);
    }
  }

  return games;
});
