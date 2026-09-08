import { getSteamAppDetails } from "@main/services";

import type { GameShop, ShopDetailsWithAssets } from "@types";

import { registerEvent } from "../register-event";
import { storeKeys, gamesShopAssetsStore } from "@main/store";
import { MakaiApi } from "@main/services/makai-api";
import { localGetGame } from "@main/services/local-catalog";

function mapApiGameToShopDetails(apiGame: any, assets: any, objectId: string): ShopDetailsWithAssets {
  return {
    objectId,
    name: apiGame?.title || assets?.title || objectId,
    steam_appid: apiGame?.steam_appid || 0,
    detailed_description: apiGame?.detailedDescription ? `<p>${apiGame.detailedDescription}</p>` : "",
    about_the_game: apiGame?.detailedDescription ? `<p>${apiGame.detailedDescription}</p>` : "",
    description: apiGame?.shortDescription || "",
    about: apiGame?.shortDescription || "",
    short_description: apiGame?.shortDescription || "",
    shortDescription: apiGame?.shortDescription || "",
    headerImage: apiGame?.libraryImageUrl || assets?.libraryImageUrl || "",
    background: apiGame?.libraryHeroImageUrl || assets?.libraryHeroImageUrl || "",
    screenshots: (apiGame?.screenshots || []).map((s: any, i: number) => ({ id: i, path_full: s.path_full, path_thumbnail: s.path_thumbnail })),
    movies: (apiGame?.movies || []).map((m: any, i: number) => ({
      id: i,
      name: m.name || `Video ${i + 1}`,
      thumbnail: m.thumbnail || "",
      highlight: m.highlight || false,
      ...(m.mp4 ? { mp4: { max: m.mp4, "480": m.mp4 } } : {}),
      ...(m.webm ? { webm: { max: m.webm, "480": m.webm } } : {}),
      ...(m.hls ? { hls_h264: m.hls } : {}),
    })),
    pc_requirements: (apiGame?.pcRequirements || { minimum: "", recommended: "" }) as { minimum: string; recommended: string },
    mac_requirements: { minimum: "", recommended: "" },
    linux_requirements: { minimum: "", recommended: "" },
    supported_languages: apiGame?.supported_languages || "",
    release_date: apiGame?.release_date || { date: "2000" },
    developers: (apiGame?.developers?.length ? apiGame.developers : ["Unknown"]) as string[],
    publishers: (apiGame?.publishers?.length ? apiGame.publishers : ["Unknown"]) as string[],
    genres: (Array.isArray(apiGame?.genres) ? apiGame.genres : []) as string[],
    categories: [],
    content_descriptors: { ids: [] },
    assets: assets || null,
  } as unknown as ShopDetailsWithAssets;
}

const getGameShopDetails = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop,
  _language: string
): Promise<ShopDetailsWithAssets | null> => {
  // Fonte primária: catálogo local (mesma lógica do ProtonForger antigo)
  const apiGame = (await localGetGame(objectId)) || (await MakaiApi.getGame(objectId));
  if (apiGame) {
    let assets = null;
    if (shop !== "steam") {
      assets = await gamesShopAssetsStore.get(storeKeys.game(shop, objectId)).catch(() => null);
    }
    return mapApiGameToShopDetails(apiGame, assets, objectId);
  }

  if (shop === "steam") {
    const steamDetails = await getSteamAppDetails(objectId, "en", "US");
    if (!steamDetails) return null;
    return {
      ...steamDetails,
      objectId,
      assets: null,
    } as unknown as ShopDetailsWithAssets;
  }

  return null;
};

registerEvent("getGameShopDetails", getGameShopDetails);
