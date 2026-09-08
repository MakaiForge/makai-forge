const CHEAPSHARK_API = "https://www.cheapshark.com/api/1.0/deals";
const STEAM_STORE_API = "https://store.steampowered.com/api/featuredcategories";

const STORE_NAMES: Record<string, string> = {
  "1": "Steam",
  "2": "GamersGate",
  "3": "GreenManGaming",
  "4": "Amazon",
  "5": "GameStop",
  "7": "GOG",
  "8": "Origin",
  "11": "Humble Store",
  "13": "Uplay",
  "15": "Fanatical",
  "21": "WinGameStore",
  "23": "GameBillet",
  "24": "Voidu",
  "25": "Epic Games",
  "27": "Gamesplanet",
  "29": "2Game",
  "30": "IndieGala",
  "31": "Blizzard",
};

interface CheapSharkDeal {
  title: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  steamAppID: string;
  storeID: string;
  thumb: string;
  dealID: string;
}

export interface DealData {
  title: string;
  salePrice: number;
  normalPrice: number;
  savingsPercent: number;
  storeName: string;
  steamAppId: string;
  thumb: string;
  dealUrl: string;
}

interface FreeGame {
  title: string;
  url: string;
  store: string;
  image: string;
  endsAt: string;
}

let cachedDeals: { data: DealData[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

export function getCachedDeals(): DealData[] | null {
  return cachedDeals?.data ?? null;
}

async function fetchSteamSpecials(): Promise<DealData[]> {
  try {
    const response = await fetch(STEAM_STORE_API, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];

    const data = await response.json();
    const specials = data?.specials?.items ?? [];

    return specials.slice(0, 12).map((item: any) => ({
      title: item.name || "Unknown",
      salePrice: (item.final_price ?? 0) / 100,
      normalPrice: (item.original_price ?? 0) / 100,
      savingsPercent: item.discount_percent ?? 0,
      storeName: "Steam",
      steamAppId: String(item.id ?? ""),
      thumb: item.header_image ?? item.capsule_image ?? "",
      dealUrl: `https://store.steampowered.com/app/${item.id}`,
    }));
  } catch {
    return [];
  }
}

export async function getDeals(): Promise<DealData[]> {
  if (cachedDeals && Date.now() - cachedDeals.timestamp < CACHE_TTL) {
    return cachedDeals.data;
  }

  try {
    const url = `${CHEAPSHARK_API}?pageSize=20&onSale=1&sortBy=Savings&lowerPrice=0`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`CheapShark API: ${response.status}`);

    const data: CheapSharkDeal[] = await response.json();

    const deals: DealData[] = data
      .filter((d) => d.steamAppID && d.thumb)
      .slice(0, 12)
      .map((d) => ({
        title: d.title,
        salePrice: parseFloat(d.salePrice),
        normalPrice: parseFloat(d.normalPrice),
        savingsPercent: Math.round(parseFloat(d.savings) * 100) / 100,
        storeName: STORE_NAMES[d.storeID] || `Store ${d.storeID}`,
        steamAppId: d.steamAppID,
        thumb: d.thumb,
        dealUrl: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
      }));

    cachedDeals = { data: deals, timestamp: Date.now() };
    return deals;
  } catch (err) {
    console.warn("[Deals] CheapShark failed, trying Steam fallback:", (err as Error)?.message);

    const fallback = await fetchSteamSpecials();
    if (fallback.length > 0) {
      cachedDeals = { data: fallback, timestamp: Date.now() };
      return fallback;
    }

    if (cachedDeals) {
      console.warn("[Deals] Both APIs failed, returning stale cache");
      return cachedDeals.data;
    }

    return [];
  }
}

let cachedFree: { data: FreeGame[]; timestamp: number } | null = null;
const FREE_CACHE_TTL = 30 * 60 * 1000;
const EPIC_LOCALE_MAP: Record<string, string> = {
  pt: "pt-BR",
  es: "es-ES",
  de: "de-DE",
  fr: "fr-FR",
  ru: "ru-RU",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
};

export function getCachedFreeGames(): FreeGame[] | null {
  return cachedFree?.data ?? null;
}

export async function getFreeGames(language?: string): Promise<FreeGame[]> {
  if (cachedFree && Date.now() - cachedFree.timestamp < FREE_CACHE_TTL) {
    return cachedFree.data;
  }

  const results: FreeGame[] = [];
  const baseLang = language?.split("-")[0] || "pt";
  const locale = EPIC_LOCALE_MAP[baseLang] || "en-US";

  try {
    const epicRes = await fetch(
      `https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=${locale}&country=BR`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (epicRes.ok) {
      const epicData = await epicRes.json();
      const elements = epicData?.data?.Catalog?.searchStore?.elements ?? [];
      for (const el of elements) {
        const promotions = el.promotions?.promotionalOffers ?? [];
        const current = promotions.flatMap((p: any) => p.promotionalOffers ?? []);
        if (current.length > 0) {
          const endDate = current[0].endDate;
          results.push({
            title: el.title,
            url: `https://store.epicgames.com/${locale}/p/${el.productSlug ?? el.urlSlug ?? el.catalogId}`,
            store: "Epic Games",
            image: el.keyImages?.[0]?.url ?? "",
            endsAt: endDate,
          });
        }
      }
    }
  } catch { /* ignore */ }

  const data = results.slice(0, 6);
  cachedFree = { data, timestamp: Date.now() };
  return data;
}
