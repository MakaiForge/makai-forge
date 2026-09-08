import { logger } from "./logger";
import type { StoreDeal } from "@types";

const GG_DEALS_API = "https://api.gg.deals/v1/prices/by-steam-app-id/";

interface GGDealsPriceEntry {
  price: {
    amount: string;
    currency: {
      code: string;
    };
    url: string;
    store: {
      name: string;
      slug: string;
    };
  };
  msrp?: {
    amount: string;
    currency: {
      code: string;
    };
  };
}

interface GGDealsResponse {
  success: boolean;
  data?: {
    [steamAppId: string]: {
      title: string;
      prices: GGDealsPriceEntry[];
    } | null;
  };
}

export async function getGGDealsPrices(
  steamAppId: string,
  apiKey: string
): Promise<{
  title: string;
  deals: StoreDeal[];
} | null> {
  try {
    const url = `${GG_DEALS_API}?ids=${steamAppId}&key=${apiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as GGDealsResponse;

    if (!data.success || !data.data) return null;

    const gameData = data.data[steamAppId];
    if (!gameData) return null;

    const deals: StoreDeal[] = (gameData.prices || []).map((entry) => {
      const storeName = entry.price.store.name || entry.price.store.slug;
      const msrp = entry.msrp?.amount || entry.price.amount;
      return {
        storeId: entry.price.store.slug,
        storeName,
        price: entry.price.amount,
        retailPrice: msrp,
        currency: entry.price.currency.code || "USD",
        dealUrl: entry.price.url,
      };
    });

    return { title: gameData.title, deals };
  } catch (err) {
    logger.error("[gg-deals] Failed to fetch prices", err);
    return null;
  }
}
