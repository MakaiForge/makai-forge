import { useState, useCallback, useEffect, useMemo } from "react";
import { useToast } from "@renderer/hooks";
import { gamesService, type GameConfig } from "@provision/AddGame/games-service";

export interface UseGamesOptions {
  searchQuery?: string;
}

export interface UseGamesReturn {
  games: GameConfig[];
  loading: boolean;
  loadGames: () => Promise<void>;
  filteredGames: GameConfig[];
  selectedGame: GameConfig | null;
  setSelectedGame: (game: GameConfig | null) => void;
  showHiddenGames: boolean;
  setShowHiddenGames: (show: boolean) => void;
  runningGameIds: Set<string>;
  launchingGameIds: Set<string>;
  setLaunchingGameIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  playGame: (game: GameConfig) => Promise<void>;
  stopGame: (game: GameConfig) => Promise<void>;
  hideGame: (game: GameConfig) => Promise<void>;
  favoriteGame: (game: GameConfig) => Promise<void>;
  deleteGame: (game: GameConfig) => Promise<void>;
  deleteGameWithPrefix: (game: GameConfig) => Promise<void>;
  duplicateGame: (game: GameConfig) => Promise<void>;
  addToSteam: (game: GameConfig) => Promise<void>;
  createShortcut: (game: GameConfig) => Promise<void>;
  revealFolder: (game: GameConfig) => Promise<void>;
  revealWinePrefix: (game: GameConfig) => Promise<void>;
  hasHiddenGames: boolean;
  runWineTool: (game: GameConfig, tool: string) => Promise<void>;
}

export function useGames(options: UseGamesOptions = {}): UseGamesReturn {
  const { searchQuery = "" } = options;
  const { showErrorToast, showSuccessToast } = useToast();

  const [games, setGames] = useState<GameConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameConfig | null>(null);
  const [showHiddenGames, setShowHiddenGames] = useState(true);
  const [runningGameIds, setRunningGameIds] = useState<Set<string>>(new Set());
  const [launchingGameIds, setLaunchingGameIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = window.electron.onGamesRunning((gamesRunning) => {
      const runningIds = new Set(gamesRunning.map((g) => g.id));
      setRunningGameIds(runningIds);
      setLaunchingGameIds((prev) => {
        const next = new Set(prev)
        for (const id of runningIds) next.delete(id)
        return next
      })
    });
    return () => unsubscribe();
  }, []);

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const loadedGames = await gamesService.getAll();
      setGames(loadedGames);
      setSelectedGame(prev => {
        if (!prev) return null;
        const updated = loadedGames.find(
          g => g.objectId === prev.objectId && g.shop === prev.shop
        );
        return updated || prev;
      });
    } catch (error) {
      console.error("Failed to load games:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // Library only reloads on mount and Sync Steam button

  const filteredGames = useMemo(() => {
    let result = [...games];

    if (!showHiddenGames) {
      result = result.filter((game) => !game.isDeleted);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (game) =>
          game.title?.toLowerCase().includes(query) ||
          game.executablePath?.toLowerCase().includes(query)
      );
    }

    return result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }, [games, showHiddenGames, searchQuery]);

  const hasHiddenGames = useMemo(() => {
    return games.some((game) => game.isDeleted);
  }, [games]);

  const playGame = useCallback(async (game: GameConfig) => {
    const gameId = `${game.shop}:${game.objectId}`;
    console.log(`[LAUNCH] adding ${gameId} to launchingGameIds`);
    setLaunchingGameIds((prev) => {
      const next = new Set(prev).add(gameId)
      console.log(`[LAUNCH] launchingGameIds now:`, [...next])
      return next
    });
    try {
      await window.electron.openGame(
        game.shop as import("@types").GameShop,
        game.objectId,
        game.executablePath || "",
        game.gameArgs || null
      );
      setLaunchingGameIds((prev) => {
        const next = new Set(prev)
        next.delete(gameId)
        return next
      })
    } catch (error) {
      console.error("Failed to play game:", error);
      setLaunchingGameIds((prev) => {
        const next = new Set(prev)
        next.delete(gameId)
        return next
      })
    }
  }, []);

  const stopGame = useCallback(async (game: GameConfig) => {
    try {
      await window.electron.closeGame(
        game.shop as import("@types").GameShop,
        game.objectId
      );
    } catch (error) {
      console.error("Failed to stop game:", error);
    }
  }, []);

  const hideGame = useCallback(
    async (game: GameConfig) => {
      try {
        await window.electron.updateGameConfig(
          game.shop as import("@types").GameShop,
          game.objectId,
          { isDeleted: !game.isDeleted }
        );
        setGames((prev) =>
          prev.map((g) =>
            g.objectId === game.objectId && g.shop === game.shop
              ? { ...g, isDeleted: !g.isDeleted }
              : g
          )
        );
      } catch (error) {
        console.error("Failed to hide game:", error);
      }
    },
    []
  );

  const favoriteGame = useCallback(
    async (game: GameConfig) => {
      try {
        if (game.favorite) {
          await window.electron.removeGameFromFavorites(
            game.shop as import("@types").GameShop,
            game.objectId
          );
        } else {
          await window.electron.addGameToFavorites(
            game.shop as import("@types").GameShop,
            game.objectId
          );
        }
        setGames((prev) =>
          prev.map((g) =>
            g.objectId === game.objectId && g.shop === game.shop
              ? { ...g, favorite: !game.favorite }
              : g
          )
        );
        setSelectedGame((prev) =>
          prev?.objectId === game.objectId && prev?.shop === game.shop
            ? { ...prev, favorite: !game.favorite }
            : prev
        );
      } catch (error) {
        console.error("Failed to toggle favorite:", error);
      }
    },
    []
  );

  const deleteGame = useCallback(
    async (game: GameConfig) => {
      await gamesService.delete(game.shop, game.objectId);
      setGames((prev) =>
        prev.filter(
          (g) => g.objectId !== game.objectId || g.shop !== game.shop
        )
      );
      setSelectedGame(null);
    },
    []
  );

  const deleteGameWithPrefix = useCallback(
    async (game: GameConfig) => {
      await gamesService.deleteWithPrefix(game.shop, game.objectId);
      setGames((prev) =>
        prev.filter(
          (g) => g.objectId !== game.objectId || g.shop !== game.shop
        )
      );
      setSelectedGame(null);
    },
    []
  );

  const duplicateGame = useCallback(
    async (game: GameConfig) => {
      try {
        const duplicateTitle = `${game.title} (Copy)`;
        await window.electron.addCustomGameToLibrary(
          duplicateTitle,
          game.executablePath || "",
          game.iconUrl || game.coverImageUrl,
          game.logoImageUrl,
          game.libraryHeroImageUrl
        );
        showSuccessToast("Jogo duplicado", `"${duplicateTitle}" foi criado.`);
      } catch (error) {
        console.error("Failed to duplicate game:", error);
        showErrorToast("Erro ao duplicar", "Não foi possível duplicar o jogo.");
      }
    },
    [showSuccessToast, showErrorToast]
  );

  const addToSteam = useCallback(async (game: GameConfig) => {
    try {
      await window.electron.createSteamShortcut(
        game.shop as import("@types").GameShop,
        game.objectId
      );
    } catch (error) {
      console.error("Failed to add to Steam:", error);
    }
  }, []);

  const createShortcut = useCallback(
    async (game: GameConfig) => {
      await addToSteam(game);
    },
    [addToSteam]
  );

  const revealFolder = useCallback(async (game: GameConfig) => {
    if (game.prefix) {
      try {
        await window.electron.openGameSaveFolder(
          game.shop as import("@types").GameShop,
          game.objectId,
          game.prefix
        );
      } catch (error) {
        console.error("Failed to open folder:", error);
        showErrorToast("Erro", "Não foi possível abrir a pasta do jogo.");
      }
    } else {
      showErrorToast("Pasta não encontrada", "Nenhum diretório de save configurado para este jogo.");
    }
  }, [showErrorToast]);

  const revealWinePrefix = useCallback(async (game: GameConfig) => {
    try {
      await window.electron.openGameWinePrefix(
        game.shop as import("@types").GameShop,
        game.objectId
      );
    } catch (error) {
      console.error("Failed to open wine prefix folder:", error);
    }
  }, []);

  const runWineTool = useCallback(async (game: GameConfig, tool: string) => {
    try {
      await window.electron.runWineTool(
        game.shop as import("@types").GameShop,
        game.objectId,
        tool
      );
    } catch (error) {
      console.error("Failed to run wine tool:", error);
      showErrorToast(
        "Falha na ferramenta Wine",
        `Não foi possível executar "${tool}". Verifique se o prefixo Wine está configurado corretamente.`
      );
    }
  }, [showErrorToast]);

  return {
    games,
    loading,
    loadGames,
    filteredGames,
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
  };
}
