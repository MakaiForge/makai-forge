import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app } from "electron";
import { handleGetSourceNamesForTitle } from "@main/services/local-sources-handler";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCacheDir(): string {
  const dir = path.join(app.getPath("userData"), "steam-cache");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKey(prefix: string, id: string): string {
  const hash = crypto.createHash("md5").update(`${prefix}:${id}`).digest("hex");
  return path.join(getCacheDir(), `${hash}.json`);
}

function readCache(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (Date.now() - data._cachedAt > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(filePath: string, data: any): void {
  fs.writeFileSync(filePath, JSON.stringify({ ...data, _cachedAt: Date.now() }));
}

const steamApi = axios.create({
  baseURL: "https://store.steampowered.com/api",
  timeout: 8000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});

const POPULAR_GAMES = [
  730, 570, 440, 578080, 1174180, 271590, 1091500, 252490, 1623730,
  236850, 105600, 1222670, 413150, 1086940, 230410, 291550, 1811260,
  359550, 1426210, 1281930,
];

export interface SteamDetails {
  title: string;
  genres: string[];
  developers: string[];
  publishers: string[];
  releaseYear: number | null;
  header_image: string | null;
  background: string | null;
  capsule_image: string | null;
  short_description: string | null;
  pc_requirements: { minimum: string; recommended: string } | null;
  screenshots: Array<{ id: number; path: string }>;
  iconUrl?: string | null;
  libraryHeroImageUrl?: string | null;
  libraryImageUrl?: string | null;
  logoImageUrl?: string | null;
}

export async function getGameDetails(steamId: string): Promise<SteamDetails | null> {
  const cacheFile = cacheKey("details", steamId);
  const cached = readCache(cacheFile);
  if (cached) return cached;

  try {
    const { data } = await steamApi.get("/appdetails", {
      params: { appids: steamId, cc: "us", l: "en" },
    });

    if (!data[steamId]?.success) return null;
    const d = data[steamId].data;

    const result: SteamDetails = {
      title: d.name,
      genres: (d.genres || []).map((g: any) => g.description),
      developers: d.developers || [],
      publishers: d.publishers || [],
      releaseYear: d.release_date?.date
        ? new Date(d.release_date.date).getFullYear()
        : null,
      header_image: d.header_image || null,
      background: d.background_raw || d.background || null,
      capsule_image: d.capsule_image || null,
      short_description: d.short_description || null,
      pc_requirements: d.pc_requirements
        ? {
            minimum: d.pc_requirements.minimum,
            recommended: d.pc_requirements.recommended,
          }
        : null,
      screenshots: (d.screenshots || []).map((s: any) => ({
        id: s.id,
        path: s.path_full || s.path_thumbnail,
      })),
      iconUrl: d.capsule_image || null,
      libraryHeroImageUrl: d.background_raw || d.background || null,
      libraryImageUrl: d.header_image || null,
      logoImageUrl: d.header_image || null,
    };

    writeCache(cacheFile, result);
    return result;
  } catch {
    return null;
  }
}

export async function getGameAssets(steamId: string): Promise<SteamDetails | null> {
  return getGameDetails(steamId);
}

const searchCache = new Map<string, { data: any; expiry: number }>();

export async function searchGames(
  query: string,
  take = 20,
  skip = 0
): Promise<{ edges: any[]; count: number }> {
  const cacheKey = `search:${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    const page = cached.data.items.slice(skip, skip + take);
    return { edges: page, count: cached.data.count };
  }

  try {
    const { data } = await steamApi.get("/storesearch", {
      params: { term: query || "2024", l: "en", cc: "us" },
    });
    const items: any[] = data?.items || [];

    // Busca detalhes em sequencia com delay pra nao tomar rate-limit
    const allItems = items.slice(0, 50);
    const edgeResults: any[] = [];
    for (const item of allItems) {
      try {
        const details = await getGameDetails(String(item.id));
        if (details) {
          edgeResults.push({
            id: String(item.id),
            objectId: String(item.id),
            shop: "steam",
            title: details.title,
            genres: details.genres || [],
            developers: details.developers || [],
            publishers: details.publishers || [],
            releaseYear: details.releaseYear || null,
            libraryImageUrl: details.libraryImageUrl || null,
            libraryHeroImageUrl: details.libraryHeroImageUrl || null,
            logoImageUrl: details.logoImageUrl || null,
            iconUrl: details.iconUrl || null,
            shortDescription: details.short_description || null,
          });
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }

    // Cache por 1 hora
    searchCache.set(cacheKey, {
      data: { items: edgeResults, count: items.length },
      expiry: Date.now() + 60 * 60 * 1000,
    });

    const page = edgeResults.slice(skip || 0, (skip || 0) + take);
    return { edges: page, count: items.length };
  } catch {
    return { edges: [], count: 0 };
  }
}

export async function getFeaturedGames(): Promise<any[]> {
  const games: any[] = [];
  for (const id of POPULAR_GAMES.slice(0, 10)) {
    try {
      const details = await getGameDetails(String(id));
      if (details) {
        const downloadSources = handleGetSourceNamesForTitle(details.title);
        games.push({
          objectId: String(id),
          shop: "steam",
          title: details.title,
          downloadSources,
          description: null,
          uri: `/game/steam/${id}`,
          iconUrl: details.iconUrl,
          libraryHeroImageUrl: details.libraryHeroImageUrl,
          libraryImageUrl: details.libraryImageUrl,
          logoImageUrl: details.logoImageUrl,
          shortUrl: null,
        });
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return games;
}
