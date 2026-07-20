import { registerEvent } from "@main/events/register-event";
import { gamesStore, gamesShopAssetsStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";
import fs from "node:fs";
import { logger } from "@main/services";

interface UpdateCustomGameParams {
  shop: GameShop;
  objectId: string;
  title: string;
  iconUrl?: string;
  logoImageUrl?: string;
  libraryHeroImageUrl?: string;
  originalIconPath?: string;
  originalLogoPath?: string;
  originalHeroPath?: string;
}

const updateCustomGame = async (
  _event: Electron.IpcMainInvokeEvent,
  params: UpdateCustomGameParams
) => {
  const {
    shop,
    objectId,
    title,
    iconUrl,
    logoImageUrl,
    libraryHeroImageUrl,
    originalIconPath,
    originalLogoPath,
    originalHeroPath,
  } = params;
  const gameKey = storeKeys.game(shop, objectId);

  const existingGame = await gamesStore.get(gameKey);
  if (!existingGame) {
    throw new Error("Game not found");
  }

  const oldAssetPaths: string[] = [];

  const assetPairs = [
    { existing: existingGame.iconUrl, new: iconUrl },
    { existing: existingGame.logoImageUrl, new: logoImageUrl },
    { existing: existingGame.libraryHeroImageUrl, new: libraryHeroImageUrl },
  ];

  for (const { existing, new: newUrl } of assetPairs) {
    if (existing?.startsWith("local:") && (!newUrl || existing !== newUrl)) {
      oldAssetPaths.push(existing.replace("local:", ""));
    }
  }

  const updatedGame = {
    ...existingGame,
    title,
    iconUrl: iconUrl || null,
    logoImageUrl: logoImageUrl || null,
    libraryHeroImageUrl: libraryHeroImageUrl || null,
    originalIconPath: originalIconPath || existingGame.originalIconPath || null,
    originalLogoPath: originalLogoPath || existingGame.originalLogoPath || null,
    originalHeroPath: originalHeroPath || existingGame.originalHeroPath || null,
  };

  await gamesStore.put(gameKey, updatedGame);

  const getCoverUrl = (url?: string): string => {
    if (!url) return "";
    if (url.includes("header.jpg")) {
      const match = url.match(/steam\/apps\/(\d+)/);
      const objectId = match ? match[1] : null;
      if (objectId) {
        return `https://shared.steamstatic.com/store_item_assets/steam/apps/${objectId}/library_600x900_2x.jpg`;
      }
    }
    return url;
  };

  const existingAssets = await gamesShopAssetsStore.get(gameKey);
  if (existingAssets) {
    const updatedAssets = {
      ...existingAssets,
      title,
      iconUrl: iconUrl || null,
      libraryHeroImageUrl: libraryHeroImageUrl || "",
      libraryImageUrl: iconUrl || "",
      logoImageUrl: logoImageUrl || "",
      coverImageUrl: getCoverUrl(iconUrl),
    };

    await gamesShopAssetsStore.put(gameKey, updatedAssets);
  }

  if (oldAssetPaths.length > 0) {
    for (const assetPath of oldAssetPaths) {
      try {
        if (fs.existsSync(assetPath)) {
          await fs.promises.unlink(assetPath);
        }
      } catch (error) {
        logger.warn(`Failed to delete old asset ${assetPath}:`, error);
      }
    }
  }

  return updatedGame;
};

registerEvent("updateCustomGame", updateCustomGame);
