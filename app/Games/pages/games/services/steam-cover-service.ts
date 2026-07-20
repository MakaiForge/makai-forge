export interface SteamCoverResult {
  success: boolean;
  steamAppId?: string;
  headerUrl?: string;
  profileUrl?: string;
  source?: string;
  error?: string;
}

export async function fetchSteamCover(
  gameName: string
): Promise<SteamCoverResult> {
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
        steamAppId: String(app.appid),
        headerUrl: `https://steamcdn-a.akamaihd.net/steam/apps/${app.appid}/header.jpg`,
        profileUrl: `https://shared.steamstatic.com/store_item_assets/steam/apps/${app.appid}/library_600x900_2x.jpg`,
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
