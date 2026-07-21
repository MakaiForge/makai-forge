const CATALOG_API = "http://localhost:8788";

export async function searchGamesApi(title: string, take = 5): Promise<any[]> {
  const query = (title || "").trim().toLowerCase();
  if (!query) return [];
  try {
    const url = `${CATALOG_API}/catalogue/search?title=${encodeURIComponent(query)}&take=${take}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getGameApi(objectId: string): Promise<any | null> {
  try {
    const url = `${CATALOG_API}/api/games/${encodeURIComponent(objectId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.game || data || null;
  } catch {
    return null;
  }
}

export function enrichGame(g: any) {
  if (!g) return null;
  const parse = (v: any) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return {
    objectId: g.objectId,
    title: g.title,
    shop: g.shop,
    genres: Array.isArray(g.genres) ? g.genres : parse(g.genres),
    libraryImageUrl: g.libraryImageUrl,
    shortDescription: g.shortDescription,
    developer: g.developer,
    releaseYear: g.releaseYear,
    recommendedProton: g.recommendedProton,
    protonConfidence: g.protonConfidence,
    protonSource: g.protonSource,
    protonAlternatives: Array.isArray(g.protonAlternatives) ? g.protonAlternatives : parse(g.protonAlternatives),
    screenshots: Array.isArray(g.screenshots) ? g.screenshots : parse(g.screenshots),
  };
}
