import { useCallback } from "react";
import { useAppDispatch, useToast } from "@renderer/hooks";
import { useTranslation } from "react-i18next";
import { LibraryGame } from "@types";
import { useGames } from "@games-ui/pages/games/hooks/use-games";
import { useLibrary } from "@renderer/hooks/use-library";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import { steamToGameConfig } from "../utils/games-utils";
import { useSteamState } from "./useSteamState";
import { useGameUIState } from "./useGameUIState";
import { useGamesDerivedData } from "./useGamesDerivedData";
import { useGameEffects } from "./useGameEffects";
import { saveGameConfig } from "../utils/saveGameConfig";
import type { GamesPageState } from "../types";

export type { GamesPageState };

export function useGamesPage(): GamesPageState {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(["library", "sidebar"]);
  const { showErrorToast, showSuccessToast } = useToast();

  const ui = useGameUIState();

  const {
    filteredGames,
    loading,
    loadGames,
    selectedGame,
    setSelectedGame,
    showHiddenGames,
    setShowHiddenGames,
    runningGameIds,
    launchingGameIds,
    setLaunchingGameIds,
    playGame,
    stopGame,
    hideGame,
    favoriteGame,
    deleteGame,
    deleteGameWithPrefix,
    duplicateGame,
    addToSteam,
    createShortcut,
    revealFolder,
    revealWinePrefix,
    hasHiddenGames,
    runWineTool,
  } = useGames({ searchQuery: ui.deferredSearchQuery });

  const { updateLibrary } = useLibrary();

  const steam = useSteamState({
    setLaunchingGameIds,
    setSelectedGame,
    setShowConfigModal: ui.setShowConfigModal,
    setClearingPrefix: ui.setClearingPrefix,
    setGameContextMenu: ui.setGameContextMenu,
    showSuccessToast,
    showErrorToast,
  });

  const derived = useGamesDerivedData({
    searchQuery: ui.searchQuery,
    deferredSearchQuery: ui.deferredSearchQuery,
    sortBy: ui.sortBy,
    steamGames: steam.steamGames,
    showAllGames: steam.showAllGames,
    modCompatibleSteamIds: steam.modCompatibleSteamIds,
    modCompatibleNames: steam.modCompatibleNames,
    filteredGames,
    loading,
    selectedSteamGame: steam.selectedSteamGame,
    selectedGame,
    runningGameIds,
    launchingGameIds,
    syncing: steam.syncing,
    t,
  });

  useGameEffects({ dispatch, t, setDllCheckModal: ui.setDllCheckModal });

  const handleSyncSteam = useCallback(async () => {
    await steam.handleSyncSteam();
    loadGames();
    updateLibrary();
  }, [steam.handleSyncSteam, loadGames, updateLibrary]);

  const handleWineTool = useCallback(
    (tool: string) => {
      if (steam.selectedSteamGame) {
        runWineTool(steamToGameConfig(steam.selectedSteamGame), tool);
      } else if (selectedGame) {
        runWineTool(selectedGame, tool);
      } else {
        showErrorToast("Nenhum jogo selecionado", "Selecione um jogo para usar as ferramentas Wine.");
      }
    },
    [steam.selectedSteamGame, selectedGame, runWineTool, showErrorToast]
  );

  const handleConfigureGame = useCallback((game: GameConfig) => {
    setSelectedGame(game);
    steam.setSelectedSteamGame(null);
    ui.setShowConfigModal(true);
  }, []);

  const handleSaveGameConfigFn = useCallback(
    (updatedGame: GameConfig, clearPrefix?: boolean) =>
      saveGameConfig({
        updatedGame, clearPrefix,
        onSteamGamesUpdate: steam.setSteamGames,
        onLoadGames: () => {},
        onError: (title, msg) => showErrorToast(title, msg),
      }),
    [steam.setSteamGames, showErrorToast]
  );

  const handleClearLocalPrefix = useCallback(async (game: GameConfig) => {
    ui.setClearingPrefix(true);
    try {
      const prefixPath = game.winePrefixPath || game.prefix;
      await window.electron.updateGameConfig(
        game.shop as import("@types").GameShop,
        game.objectId,
        { prefix: undefined, winePrefixPath: undefined }
      );
      showSuccessToast("Prefixo limpo", prefixPath ? "O caminho do prefixo foi removido da configuração." : "Nenhum prefixo configurado para este jogo.");
    } catch (error) {
      console.error("Failed to clear local prefix:", error);
      showErrorToast("Erro", "Não foi possível limpar o prefixo do jogo.");
    } finally {
      ui.setClearingPrefix(false);
    }
  }, [showSuccessToast, showErrorToast]);

  const handleSelectGame = useCallback((game: GameConfig) => {
    setSelectedGame(game);
    steam.setSelectedSteamGame(null);
  }, []);

  return {
    searchQuery: ui.searchQuery,
    setSearchQuery: ui.setSearchQuery,
    viewMode: ui.viewMode,
    sortBy: ui.sortBy,
    showAddModal: ui.showAddModal,
    setShowAddModal: ui.setShowAddModal,
    showConfigModal: ui.showConfigModal,
    setShowConfigModal: ui.setShowConfigModal,
    showDeleteModal: ui.showDeleteModal,
    setShowDeleteModal: ui.setShowDeleteModal,
    showBackupModal: ui.showBackupModal,
    setShowBackupModal: ui.setShowBackupModal,
    showBackupPanel: ui.showBackupPanel,
    setShowBackupPanel: ui.setShowBackupPanel,
    backupProvider: ui.backupProvider,
    setBackupProvider: ui.setBackupProvider,
    dllCheckModal: ui.dllCheckModal,
    setDllCheckModal: ui.setDllCheckModal,
    steamGames: steam.steamGames,
    syncing: steam.syncing,
    selectedSteamGame: steam.selectedSteamGame,
    showAllGames: steam.showAllGames,
    erroredImages: ui.erroredImages,
    clearingPrefix: ui.clearingPrefix,
    steamFavoritedIds: steam.steamFavoritedIds,
    gameContextMenu: ui.gameContextMenu,
    filteredGames,
    loading,
    loadGames,
    selectedGame,
    setSelectedGame,
    showHiddenGames,
    setShowHiddenGames,
    runningGameIds,
    launchingGameIds,
    playGame,
    stopGame,
    hideGame,
    favoriteGame,
    deleteGame,
    deleteGameWithPrefix,
    duplicateGame,
    addToSteam,
    createShortcut,
    revealFolder,
    revealWinePrefix,
    hasHiddenGames,
    handleSyncSteam,
    handlePlaySteam: steam.handlePlaySteam,
    handleWineTool,
    handleFavoriteSteam: steam.handleFavoriteSteam,
    handleConfigureGame,
    handleConfigureSteamGame: steam.handleConfigureSteamGame,
    handleSaveGameConfig: handleSaveGameConfigFn,
    handleOpenSteamContextMenu: steam.handleOpenSteamContextMenu,
    handleClearSteamPrefix: steam.handleClearSteamPrefix,
    handleClearLocalPrefix,
    handleViewModeChange: ui.handleViewModeChange,
    handleSortChange: ui.handleSortChange,
    handleSelectGame,
    handleSelectSteamGame: steam.handleSelectSteamGame,
    handleOpenContextMenu: ui.handleOpenContextMenu,
    handleCloseContextMenu: ui.handleCloseContextMenu,
    handleImageError: ui.handleImageError,
    filteredSteam: derived.filteredSteam,
    localGames: derived.localGames,
    librarySteamGames: derived.librarySteamGames,
    hasSteamGames: derived.hasSteamGames,
    hasLocalGames: derived.hasLocalGames,
    hasLibrarySteamGames: derived.hasLibrarySteamGames,
    showEmpty: derived.showEmpty,
    showNoSearchResults: derived.showNoSearchResults,
    showLoading: derived.showLoading,
    activeGame: derived.activeGame,
    isSteamActive: derived.isSteamActive,
    isRunning: derived.isRunning,
    isLaunching: derived.isLaunching,
    syncLabel: derived.syncLabel,
    updateLibrary,
  };
}
