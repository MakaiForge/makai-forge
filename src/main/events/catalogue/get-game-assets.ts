import type { GameShop } from "@types";
import { registerEvent } from "../register-event";
import { gamesShopAssetsStore, storeKeys } from "@main/store";
import { getGameDetails } from "../misc/helpers/steam-local";
import { handleGetSourceNamesForTitle } from "@main/services/local-sources-handler";
import { localGetGame } from "@main/services/local-catalog";
import { MakaiApi } from "@main/services/makai-api";

const cacheAssets = async (shop: GameShop, objectId: string, assets: any) => {
  if (!assets) return;
  await gamesShopAssetsStore
    .put(storeKeys.game(shop, objectId), { ...assets, updatedAt: Date.now() })
    .catch(() => {});
};

export const getGameAssets = async (objectId: string, shop: GameShop) => {
  const apiGame = await MakaiApi.getGame(objectId).catch(() => null);
  if (apiGame) {
    const assets = {
      objectId,
      shop,
      title: apiGame.title,
      iconUrl: apiGame.libraryImageUrl || null,
      libraryImageUrl: apiGame.libraryImageUrl || null,
      libraryHeroImageUrl: apiGame.libraryHeroImageUrl || null,
      logoImageUrl: apiGame.libraryImageUrl || null,
      coverImageUrl: null,
      logoPosition: null,
      downloadSources: apiGame.downloadSources || [],
      downloads: apiGame.downloads || [],
      screenshots: apiGame.screenshots || [],
      shortDescription: apiGame.shortDescription || null,
      pcRequirements: apiGame.pcRequirements || null,
      updatedAt: Date.now(),
    };
    await cacheAssets(shop, objectId, assets);
    return assets;
  }

  if (shop === "steam") {
    try {
      const details = await getGameDetails(objectId);
      if (!details) return null;

      const downloadSources = handleGetSourceNamesForTitle(details.title);

      const assets = {
        objectId,
        shop,
        title: details.title,
        iconUrl: details.iconUrl || null,
        libraryHeroImageUrl: details.libraryHeroImageUrl || null,
        libraryImageUrl: details.libraryImageUrl || null,
        logoImageUrl: details.logoImageUrl || null,
        coverImageUrl: null,
        logoPosition: null,
        downloadSources,
        updatedAt: Date.now(),
      };
      await cacheAssets(shop, objectId, assets);
      return assets;
    } catch {
      return null;
    }
  }

  // Fallback: catálogo local (o MakaiApi remoto pode estar fora do ar)
  const localGame = await localGetGame(objectId).catch(() => null);
  if (localGame) {
    const assets = {
      objectId,
      shop,
      title: localGame.title,
      iconUrl: localGame.iconUrl || null,
      libraryHeroImageUrl: localGame.libraryHeroImageUrl || null,
      libraryImageUrl: localGame.libraryImageUrl || null,
      logoImageUrl: localGame.libraryImageUrl || null,
      coverImageUrl: null,
      logoPosition: null,
      downloadSources: localGame.downloadSources || [],
      downloads: localGame.downloads || [],
      screenshots: localGame.screenshots || [],
      shortDescription: localGame.shortDescription || null,
      pcRequirements: localGame.pcRequirements || null,
      updatedAt: Date.now(),
    };
    await cacheAssets(shop, objectId, assets);
    return assets;
  }

  const gameKey = storeKeys.game(shop, objectId);
  // Jogos sem assets salvos não existem no store — retorna null em vez de lançar
  return (await gamesShopAssetsStore.get(gameKey).catch(() => null)) || null;
};

const getGameAssetsEvent = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop
) => {
  return getGameAssets(objectId, shop);
};

registerEvent("getGameAssets", getGameAssetsEvent);
