const BASE_URL = "http://localhost:8788";

interface SearchResult {
  edges: Array<{
    id: string;
    objectId: string;
    title: string;
    shop: string | null;
    genres: string[];
    releaseYear: number | null;
    libraryImageUrl: string | null;
    shortDescription: string | null;
  }>;
  count: number;
}

interface GameDetail {
  objectId: string;
  title: string;
  shop: string | null;
  genres: string[];
  libraryImageUrl: string | null;
  libraryCapsuleUrl: string | null;
  libraryHeroImageUrl: string | null;
  screenshots: Array<{ id: number; path_full: string; path_thumbnail: string }>;
  movies?: Array<{ id: number; name: string; thumbnail: string; webm?: any; mp4?: any }>;
  developers: string[];
  publishers: string[];
  detailedDescription: string | null;
  shortDescription: string | null;
  downloads: any[];
  downloadSources: any[];
  steam_appid?: number;
  pcRequirements?: { minimum?: string; recommended?: string };
  minimum?: string;
  recommended?: string;
  release_date?: { date: string };
  [key: string]: any;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const MakaiApi = {
  searchGames(filters: Record<string, any>, take = 20, skip = 0): Promise<SearchResult | null> {
    const params = new URLSearchParams({ title: filters.title || "", take: String(take), skip: String(skip) });

    ["genre", "publishers", "developers", "downloadSourceFingerprints", "protondbSupportBadges", "deckCompatibility"].forEach((key) => {
      if (filters[key]?.length) {
        filters[key].forEach((val: string) => params.append(key, val));
      }
    });

    ["tags"].forEach((key) => {
      if (filters[key]?.length) {
        filters[key].forEach((val: number) => params.append(key, String(val)));
      }
    });

    if (filters.releaseYear) {
      if (filters.releaseYear.gte != null) params.set("releaseYearGte", String(filters.releaseYear.gte));
      if (filters.releaseYear.lte != null) params.set("releaseYearLte", String(filters.releaseYear.lte));
    }

    if (filters.showAdult) {
      params.set("showAdult", "true");
    }

    return fetchJson(`${BASE_URL}/catalogue/search?${params}`);
  },

  searchSuggestions(title: string): Promise<Array<{ objectId: string; title: string; shop: string | null }> | null> {
    const params = new URLSearchParams({ title });
    return fetchJson(`${BASE_URL}/catalogue/search/suggestions?${params}`);
  },

  getGame(objectId: string): Promise<GameDetail | null> {
    return fetchJson(`${BASE_URL}/api/games/${objectId}`);
  },

  getScripts(gameId: string): Promise<any[] | null> {
    const params = new URLSearchParams({ game_id: gameId });
    return fetchJson(`${BASE_URL}/api/scripts?${params}`);
  },
};
