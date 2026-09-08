import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { logger } from "./logger";
import { getCurrencyForLanguage, getExchangeRate } from "./currency";
import { getGGDealsPrices } from "./gg-deals-prices";
import type { GamePrices, StoreDeal } from "@types";

const CHEAPSHARK_GAME_URL = "https://www.cheapshark.com/api/1.0/games";
const CHEAPSHARK_REDIRECT = "https://www.cheapshark.com/redirect?dealID=";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  data: GamePrices;
  cachedAt: number;
}

interface CheapSharkGame {
  gameID: string;
  steamAppID: string;
  cheapest: string;
  cheapestDealID: string;
  external: string;
  thumb: string;
}

interface CheapSharkDeal {
  storeID: string;
  dealID: string;
  price: string;
  retailPrice: string;
  savings: string;
}

interface CheapSharkStore {
  storeID: string;
  storeName: string;
  isActive: number;
}

interface CheapSharkGameDetails {
  info: CheapSharkGame;
  deals: CheapSharkDeal[];
  stores?: CheapSharkStore[];
}

const CHEAPSHARK_STORES_URL = "https://www.cheapshark.com/api/1.0/stores";

let storesCache: CheapSharkStore[] | null = null;

async function getStores(): Promise<CheapSharkStore[]> {
  if (storesCache) return storesCache;
  try {
    const res = await fetch(CHEAPSHARK_STORES_URL);
    const data = (await res.json()) as CheapSharkStore[];
    storesCache = data;
    return data;
  } catch {
    return [];
  }
}

function buildDealUrl(dealId: string): string {
  return `${CHEAPSHARK_REDIRECT}${dealId}`;
}

function getCachePath(steamAppId: string): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, "app", "_data", "price-cache")
    : path.join(app.getAppPath(), "app", "_data", "price-cache");

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${steamAppId}.json`);
}

function readFromDisk(steamAppId: string): GamePrices | null {
  try {
    const filePath = getCachePath(steamAppId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.data;
    return null;
  } catch {
    return null;
  }
}

function writeToDisk(steamAppId: string, data: GamePrices): void {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    fs.writeFileSync(getCachePath(steamAppId), JSON.stringify(entry), "utf-8");
  } catch (err) {
    logger.error("[price-lookup] Failed to cache to disk", err);
  }
}

export async function getGamePrices(
  steamAppId: string,
  language?: string,
  ggDealsKey?: string
): Promise<GamePrices | null> {
  const cached = readFromDisk(steamAppId);
  if (cached && !ggDealsKey) {
    if (language) return convertPrices(cached, language);
    return cached;
  }

  try {
    const [stores, gameResults, ggDealsResult] = await Promise.all([
      getStores(),
      fetch(
        `${CHEAPSHARK_GAME_URL}?steamAppID=${steamAppId}&limit=1`
      ).then((r) => r.json() as Promise<CheapSharkGame[]>),
      ggDealsKey
        ? getGGDealsPrices(steamAppId, ggDealsKey)
        : Promise.resolve(null),
    ]);

    let deals: StoreDeal[] = [];
    let title = "";
    let cheapest = "0";

    if (gameResults && gameResults.length > 0) {
      const game = gameResults[0];
      title = game.external || title;
      cheapest = game.cheapest || cheapest;

      const details = (await fetch(
        `${CHEAPSHARK_GAME_URL}?id=${game.gameID}`
      ).then((r) => r.json())) as CheapSharkGameDetails;

      const storeMap = new Map(stores.map((s) => [s.storeID, s]));

      deals = (details.deals || [])
        .map((deal) => {
          const store = storeMap.get(deal.storeID);
          if (!store || store.isActive !== 1) return null;
          return {
            storeId: `cs_${deal.storeID}`,
            storeName: store.storeName,
            price: deal.price,
            retailPrice: deal.retailPrice,
            currency: "USD",
            dealUrl: buildDealUrl(deal.dealID),
          };
        })
        .filter((d): d is StoreDeal => d !== null);
    }

    if (ggDealsResult) {
      title = ggDealsResult.title || title;

      const existingStores = new Set(deals.map((d) => d.storeName.toLowerCase()));
      for (const deal of ggDealsResult.deals) {
        const key = deal.storeName.toLowerCase();
        if (existingStores.has(key)) continue;
        existingStores.add(key);

        if (deal.currency !== "USD") {
          deals.push(deal);
        } else {
          deals.push({ ...deal, currency: deal.currency });
        }
      }
    }

    const currency = "USD";
    const usdResult: GamePrices = {
      steamAppId,
      title,
      cheapest,
      currency,
      deals,
      cachedAt: Date.now(),
    };

    if (!ggDealsKey) writeToDisk(steamAppId, usdResult);

    if (language) return convertPrices(usdResult, language);
    return usdResult;
  } catch (err) {
    logger.error("[price-lookup] Failed to fetch prices", err);
    return null;
  }
}

async function convertPrices(
  prices: GamePrices,
  language: string
): Promise<GamePrices> {
  const targetCurrency = getCurrencyForLanguage(language);
  if (targetCurrency === "USD") return prices;

  const rate = await getExchangeRate("USD", targetCurrency);
  if (rate === 1) return prices;

  const toTarget = (usd: string): string => {
    const num = parseFloat(usd);
    if (isNaN(num)) return usd;
    return (num * rate).toFixed(2);
  };

  return {
    ...prices,
    currency: targetCurrency,
    cheapest: toTarget(prices.cheapest),
    deals: prices.deals.map((d) => ({
      ...d,
      currency: targetCurrency,
      price: toTarget(d.price),
      retailPrice: toTarget(d.retailPrice),
    })),
  };
}
