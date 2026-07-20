import type { SteamInstalledGame } from "@types";
import type { GameConfig } from "../components/modals/add-game/games-service";
import type { SortOption } from "@renderer/pages/games/games-types";

export const SORT_OPTIONS: SortOption[] = [
  "title_asc",
  "recently_played",
  "most_played",
  "installed_first",
  "title_desc",
];

export const STEAM_FALLBACK_IMAGE =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='460' height='215'><rect fill='%231b2838' width='460' height='215'/><text fill='%23555' font-size='14' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'>Sem imagem</text></svg>";

export function steamImageUrl(appId: string): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

export function steamHeaderUrl(appId: string): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

export function localGameCoverUrl(game: GameConfig): string | null {
  return (
    game.coverImageUrl ||
    game.libraryHeroImageUrl ||
    game.libraryImageUrl ||
    game.iconUrl ||
    null
  );
}

export function steamToGameConfig(game: SteamInstalledGame): GameConfig {
  return {
    objectId: `steam_${game.appId}`,
    shop: "steam",
    title: game.name,
    slug: game.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    runner: "steam",
    isDeleted: false,
    favorite: false,
    executablePath: "",
    coverImageUrl: steamImageUrl(game.appId),
    libraryHeroImageUrl: steamHeaderUrl(game.appId),
    winePrefixPath: game.compatDataPath ? game.compatDataPath + "/pfx" : "",
    playTimeInMilliseconds: 0,
    lastTimePlayed: null,
  };
}

export function sortGames<T extends { title?: string; name?: string; favorite?: boolean; lastTimePlayed?: string | null; playTimeInMilliseconds?: number; isDeleted?: boolean }>(
  list: T[],
  getName: (g: T) => string,
  sortBy: SortOption
): T[] {
  return [...list].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    switch (sortBy) {
      case "title_asc":
        return getName(a).localeCompare(getName(b));
      case "title_desc":
        return getName(b).localeCompare(getName(a));
      case "recently_played":
        return ((b.lastTimePlayed || "") > (a.lastTimePlayed || "") ? 1 : -1);
      case "most_played":
        return (b.playTimeInMilliseconds || 0) - (a.playTimeInMilliseconds || 0);
      case "installed_first":
        return a.isDeleted === b.isDeleted ? 0 : a.isDeleted ? 1 : -1;
      default:
        return 0;
    }
  });
}
