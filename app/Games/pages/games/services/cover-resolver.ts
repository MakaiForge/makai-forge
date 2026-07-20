import {
  fetchLutrisCover,
  fetchSteamGridCover,
  type CoverResult,
} from "./cover-service";

export async function searchGameCover(gameName: string): Promise<CoverResult> {
  const lutrisResult = await fetchLutrisCover(gameName);

  if (lutrisResult.success && lutrisResult.coverUrl) {
    return lutrisResult;
  }

  const steamResult = await fetchSteamGridCover(gameName);

  if (steamResult.success && steamResult.coverUrl) {
    return steamResult;
  }

  return {
    success: false,
    error: "No cover found in any source",
  };
}
