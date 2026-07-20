import { registerEvent } from "@main/events/register-event";
import { logger } from "@main/services";
import { gamesStore, gamesShopAssetsStore, storeKeys } from "@main/store";
import type { GameShop, Game } from "@types";
import fs from "node:fs";

const collectAssetPathsToDelete = (game: Game): string[] => {
  const assetPathsToDelete: string[] = [];

  const assetUrls =
    game.shop !== "steam"
      ? [game.iconUrl, game.logoImageUrl, game.libraryHeroImageUrl]
      : [game.customIconUrl, game.customLogoImageUrl, game.customHeroImageUrl];

  for (const url of assetUrls) {
    if (url?.startsWith("local:")) {
      assetPathsToDelete.push(url.replace("local:", ""));
    }
  }

  return assetPathsToDelete;
};

const updateGameAsDeleted = async (
  game: Game,
  gameKey: string
): Promise<void> => {
  const updatedGame = {
    ...game,
    isDeleted: true,
    executablePath: null,
    ...(game.shop === "steam" && {
      customIconUrl: null,
      customLogoImageUrl: null,
      customHeroImageUrl: null,
    }),
  };

  await gamesStore.put(gameKey, updatedGame);
};

const resetShopAssets = async (gameKey: string): Promise<void> => {
  const existingAssets = await gamesShopAssetsStore.get(gameKey);
  if (existingAssets) {
    const resetAssets = {
      ...existingAssets,
      title: existingAssets.title,
    };
    await gamesShopAssetsStore.put(gameKey, resetAssets);
  }
};

const deleteAssetFiles = async (
  assetPathsToDelete: string[]
): Promise<void> => {
  if (assetPathsToDelete.length === 0) return;

  for (const assetPath of assetPathsToDelete) {
    try {
      if (fs.existsSync(assetPath)) {
        await fs.promises.unlink(assetPath);
      }
    } catch (error) {
      logger.warn(`Failed to delete asset ${assetPath}:`, error);
    }
  }
};

const removeGameFromLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) return;

  const assetPathsToDelete = collectAssetPathsToDelete(game);

  await updateGameAsDeleted(game, gameKey);

  if (game.shop === "steam") {
    await resetShopAssets(gameKey);
  }

  await deleteAssetFiles(assetPathsToDelete);
};

registerEvent("removeGameFromLibrary", removeGameFromLibrary);
