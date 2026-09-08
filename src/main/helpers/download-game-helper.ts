import {
  downloadsStore,
  gamesShopAssetsStore,
  gamesStore,
} from "@main/store";
import { localGetGame } from "@main/services/local-catalog";
import type { GameShop } from "@types";

interface PrepareGameEntryParams {
  gameKey: string;
  title: string;
  objectId: string;
  shop: GameShop;
}

export const prepareGameEntry = async ({
  gameKey,
  title,
  objectId,
  shop,
}: PrepareGameEntryParams): Promise<void> => {
  let game: Record<string, unknown> | undefined;
  let gameAssets: Record<string, unknown> | undefined;
  try {
    game = await gamesStore.get(gameKey);
  } catch {
    // Game not in library yet
  }
  try {
    gameAssets = await gamesShopAssetsStore.get(gameKey);
  } catch {
    // Assets not cached yet
  }

  // Fallback: catálogo local (mesma fonte da versão antiga — o store fica
  // vazio quando o jogo nunca teve os assets persistidos).
  if (!gameAssets) {
    try {
      const localGame = await localGetGame(objectId);
      if (localGame) {
        gameAssets = {
          iconUrl: localGame.iconUrl || null,
          libraryHeroImageUrl: localGame.libraryHeroImageUrl || null,
          libraryImageUrl: localGame.libraryImageUrl || null,
          logoImageUrl: localGame.libraryImageUrl || null,
        };
      }
    } catch {
      // Catálogo indisponível — segue sem imagem
    }
  }

  await downloadsStore.del(gameKey).catch(() => {});

  if (game) {
    await gamesStore.put(gameKey, {
      ...game,
      // Preenche imagens que faltam (jogos adicionados antes do fix)
      iconUrl: (game.iconUrl as any) ?? gameAssets?.iconUrl ?? null,
      libraryHeroImageUrl:
        (game.libraryHeroImageUrl as any) ??
        gameAssets?.libraryHeroImageUrl ??
        null,
      libraryImageUrl:
        (game.libraryImageUrl as any) ??
        gameAssets?.libraryImageUrl ??
        null,
      logoImageUrl:
        (game.logoImageUrl as any) ?? gameAssets?.logoImageUrl ?? null,
      isDeleted: false,
    });
  } else {
    await gamesStore.put(gameKey, {
      title,
      iconUrl: gameAssets?.iconUrl ?? null,
      libraryHeroImageUrl: gameAssets?.libraryHeroImageUrl ?? null,
      libraryImageUrl: gameAssets?.libraryImageUrl ?? null,
      logoImageUrl: gameAssets?.logoImageUrl ?? null,
      objectId,
      shop,
      remoteId: null,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      isDeleted: false,
    });
  }
};
