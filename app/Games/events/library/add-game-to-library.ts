import { registerEvent } from "@main/events/register-event";
import type { GameShop } from "@types";
import { createGame } from "@main/services/library-sync";
import {
  downloadsStore,
  gamesShopAssetsStore,
  gamesStore,
  storeKeys,
} from "@main/store";
import { MakaiApi } from "@main/services/makai-api";

export const addGameToLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  title: string
) => {
  const gameKey = storeKeys.game(shop, objectId);
  let game = await gamesStore.get(gameKey).catch(() => null);

  let gameAssets = shop !== "steam"
    ? await gamesShopAssetsStore.get(gameKey).catch(() => null)
    : null;

  if (!gameAssets && shop !== "steam") {
    const apiGame = await MakaiApi.getGame(objectId);
    if (apiGame) {
      gameAssets = {
        objectId,
        shop,
        title: apiGame.title,
        iconUrl: apiGame.libraryImageUrl || null,
        libraryImageUrl: apiGame.libraryImageUrl || null,
        libraryHeroImageUrl: apiGame.libraryHeroImageUrl || null,
        logoImageUrl: apiGame.libraryImageUrl || null,
        coverImageUrl: null,
        logoPosition: null,
        updatedAt: Date.now(),
      } as any;
      await gamesShopAssetsStore.put(gameKey, gameAssets);
    }
  }

  if (game) {
    await downloadsStore.del(gameKey);

    game.isDeleted = false;

    await gamesStore.put(gameKey, game);
  } else {
    game = {
      title,
      iconUrl: gameAssets?.iconUrl ?? null,
      libraryHeroImageUrl: gameAssets?.libraryHeroImageUrl ?? null,
      logoImageUrl: gameAssets?.logoImageUrl ?? null,
      objectId,
      shop,
      remoteId: null,
      isDeleted: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
    };

    await gamesStore.put(gameKey, game);
  }

  if (game) {
    await createGame(game).catch(() => {});
  }
};

registerEvent("addGameToLibrary", addGameToLibrary);
