import { useMemo } from "react";
import { SteamInstalledGame } from "@types";
import type { GameConfig } from "../components/modals/add-game/games-service";
import { sortGames, steamToGameConfig } from "../utils/games-utils";
import type { SortOption } from "@renderer/pages/games/games-types";

interface DerivedDataInput {
  searchQuery: string;
  deferredSearchQuery: string;
  sortBy: SortOption;
  steamGames: SteamInstalledGame[];
  showAllGames: boolean;
  modCompatibleSteamIds: Set<string>;
  modCompatibleNames: Set<string>;
  filteredGames: GameConfig[];
  loading: boolean;
  selectedSteamGame: SteamInstalledGame | null;
  selectedGame: GameConfig | null;
  runningGameIds: Set<string>;
  launchingGameIds: Set<string>;
  syncing: boolean;
  t: (key: string, fallback?: string) => string;
}

export interface GamesDerivedData {
  filteredSteam: SteamInstalledGame[];
  localGames: GameConfig[];
  librarySteamGames: GameConfig[];
  hasSteamGames: boolean;
  hasLocalGames: boolean;
  hasLibrarySteamGames: boolean;
  showEmpty: boolean;
  showNoSearchResults: boolean;
  showLoading: boolean;
  activeGame: GameConfig | null;
  isSteamActive: boolean;
  isRunning: boolean;
  isLaunching: boolean;
  syncLabel: string;
}

export function useGamesDerivedData(input: DerivedDataInput): GamesDerivedData {
  const {
    searchQuery,
    deferredSearchQuery,
    sortBy,
    steamGames,
    showAllGames,
    modCompatibleSteamIds,
    modCompatibleNames,
    filteredGames,
    loading,
    selectedSteamGame,
    selectedGame,
    runningGameIds,
    launchingGameIds,
    syncing,
    t,
  } = input;

  const searchLower = deferredSearchQuery.toLowerCase();
  const isNumericSearch = !isNaN(Number(searchQuery)) && searchQuery.length > 0;

  const filteredSteam = useMemo(
    () =>
      sortGames(
        steamGames.filter(
          (g) =>
            !searchQuery ||
            g.name.toLowerCase().includes(searchLower) ||
            (isNumericSearch && g.appId === searchQuery)
        ).filter(
          (g) => showAllGames || modCompatibleSteamIds.has(g.appId)
        ),
        (g) => g.name,
        sortBy
      ),
    [steamGames, searchQuery, searchLower, isNumericSearch, sortBy, showAllGames, modCompatibleSteamIds]
  );

  const sortedGames = sortGames(filteredGames, (g) => g.title || "", sortBy);
  const localGames = sortedGames.filter(
    (g) => g.shop !== "steam" && (showAllGames || modCompatibleNames.has((g.title || "").toLowerCase()))
  );

  const filteredSteamAppIds = useMemo(
    () => new Set(filteredSteam.map((g) => g.appId)),
    [filteredSteam]
  );

  const librarySteamGames = sortedGames.filter(
    (g) =>
      g.shop === "steam" &&
      !filteredSteamAppIds.has(g.objectId) &&
      (showAllGames || modCompatibleNames.has((g.title || "").toLowerCase()))
  );

  const hasSteamGames = filteredSteam.length > 0;
  const hasLocalGames = localGames.length > 0;
  const hasLibrarySteamGames = librarySteamGames.length > 0;
  const showEmpty = !loading && !hasSteamGames && !hasLocalGames && !hasLibrarySteamGames && !searchQuery;
  const showNoSearchResults = searchQuery && !hasSteamGames && !hasLocalGames && !hasLibrarySteamGames;
  const showLoading = loading && !hasSteamGames && !hasLocalGames && !hasLibrarySteamGames;

  const activeGame = selectedSteamGame
    ? steamToGameConfig(selectedSteamGame)
    : selectedGame;
  const isSteamActive = !!selectedSteamGame;
  const isRunning =
    !!activeGame &&
    runningGameIds.has(`${activeGame.shop}:${activeGame.objectId}`);
  const isLaunching =
    !!activeGame &&
    launchingGameIds.has(`${activeGame.shop}:${activeGame.objectId}`);

  const syncLabel = syncing
    ? t("syncing", "Sincronizando...")
    : t("sync_steam", "Sincronizar Steam");

  return {
    filteredSteam,
    localGames,
    librarySteamGames,
    hasSteamGames,
    hasLocalGames,
    hasLibrarySteamGames,
    showEmpty,
    showNoSearchResults,
    showLoading,
    activeGame,
    isSteamActive,
    isRunning,
    isLaunching,
    syncLabel,
  };
}
