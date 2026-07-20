export interface CoverResult {
  success: boolean;
  coverUrl?: string;
  source?: string;
  error?: string;
}

export interface CoverService {
  searchCover: (gameName: string) => Promise<CoverResult>;
}

export async function fetchLutrisCover(gameName: string): Promise<CoverResult> {
  try {
    const slug = gameName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const response = await fetch(
      `https://lutris.com/api/games?search=${encodeURIComponent(gameName)}`,
      { headers: { "User-Agent": "Makai-forger" } }
    );

    if (!response.ok) {
      return { success: false, error: "API unavailable" };
    }

    const games = await response.json();

    if (!games || games.length === 0) {
      return { success: false, error: "Game not found" };
    }

    const exactMatch = games.find(
      (g: any) =>
        g.slug === slug || g.name.toLowerCase() === gameName.toLowerCase()
    );

    const game = exactMatch || games[0];

    if (game.coverart) {
      return {
        success: true,
        coverUrl: `https://lutris.net${game.coverart}`,
        source: "lutris",
      };
    }

    return { success: false, error: "No cover found" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function fetchSteamGridCover(
  gameName: string
): Promise<CoverResult> {
  try {
    const searchResponse = await fetch(
      `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(gameName)}`,
      { headers: { "User-Agent": "Makai-forger" } }
    );

    if (!searchResponse.ok) {
      return { success: false, error: "Steam search failed" };
    }

    const apps = await searchResponse.json();

    if (!apps || apps.length === 0) {
      return { success: false, error: "Game not found" };
    }

    const app = apps[0];

    if (app.logo) {
      return {
        success: true,
        coverUrl: `https://steamcdn-a.akamaihd.net/steam/apps/${app.appid}/header.jpg`,
        source: "steam",
      };
    }

    return { success: false, error: "No cover found" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
