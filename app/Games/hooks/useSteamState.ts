import { useState, useCallback, useEffect } from "react";
import { SteamInstalledGame } from "@types";
import type { GameConfig } from "../components/modals/add-game/games-service";
import { steamToGameConfig } from "../utils/games-utils";

interface UseSteamStateParams {
  setLaunchingGameIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedGame: (game: GameConfig | null) => void;
  setShowConfigModal: (v: boolean) => void;
  setClearingPrefix: (v: boolean | ((prev: boolean) => boolean)) => void;
  setGameContextMenu: React.Dispatch<
    React.SetStateAction<{
      game: GameConfig | null;
      visible: boolean;
      position: { x: number; y: number };
    }>
  >;
  showSuccessToast: (title: string, msg: string) => void;
  showErrorToast: (title: string, msg: string) => void;
}

export interface SteamState {
  steamGames: SteamInstalledGame[];
  setSteamGames: React.Dispatch<React.SetStateAction<SteamInstalledGame[]>>;
  syncing: boolean;
  selectedSteamGame: SteamInstalledGame | null;
  setSelectedSteamGame: (game: SteamInstalledGame | null) => void;
  steamFavoritedIds: Set<string>;
  modCompatibleSteamIds: Set<string>;
  modCompatibleNames: Set<string>;
  showAllGames: boolean;
  setShowAllGames: (v: boolean) => void;
  handleSyncSteam: () => Promise<void>;
  handlePlaySteam: (game: SteamInstalledGame) => Promise<void>;
  handleFavoriteSteam: (game: SteamInstalledGame) => Promise<void>;
  handleConfigureSteamGame: (game: SteamInstalledGame) => void;
  handleOpenSteamContextMenu: (game: SteamInstalledGame, pos: { x: number; y: number }) => void;
  handleClearSteamPrefix: (game: SteamInstalledGame) => Promise<void>;
  handleSelectSteamGame: (game: SteamInstalledGame) => void;
}

export function useSteamState(params: UseSteamStateParams): SteamState {
  const {
    setLaunchingGameIds,
    setSelectedGame: onSetSelectedGame,
    setShowConfigModal,
    setClearingPrefix,
    setGameContextMenu,
    showSuccessToast,
    showErrorToast,
  } = params;

  const [steamGames, setSteamGames] = useState<SteamInstalledGame[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [selectedSteamGame, setSelectedSteamGame] =
    useState<SteamInstalledGame | null>(null);
  const [modCompatibleSteamIds, setModCompatibleSteamIds] = useState<Set<string>>(new Set());
  const [modCompatibleNames, setModCompatibleNames] = useState<Set<string>>(new Set());
  const [showAllGames, setShowAllGames] = useState(true);

  const [steamFavoritedIds, setSteamFavoritedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("steam-favorited-ids");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleSyncSteam = useCallback(async () => {
    setSyncing(true);
    try {
      const games = await window.electron.syncSteamLibrary();
      setSteamGames(games);
      if (games.length === 0) {
        showSuccessToast("Steam sincronizada", "Nenhum jogo Steam encontrado.");
      } else {
        showSuccessToast(
          "Steam sincronizada",
          `${games.length} jogo(s) encontrado(s).`
        );
      }
    } catch (err) {
      console.error("Steam sync failed", err);
      showErrorToast(
        "Falha na sincronização",
        "Não foi possível sincronizar sua biblioteca Steam. Verifique se o Steam está rodando e tente novamente."
      );
    } finally {
      setSyncing(false);
    }
  }, [showSuccessToast, showErrorToast]);

  const handlePlaySteam = useCallback(async (game: SteamInstalledGame) => {
    setLaunchingGameIds((prev) => new Set(prev).add(`steam:${game.appId}`));
    try {
      const config = await window.electron.getSteamGameConfig(game.appId);
      if (config?.useCustomLaunch && config.executablePath) {
        await window.electron.openGame(
          "steam" as const,
          game.appId,
          config.executablePath,
          config.launchOptions || null
        );
      } else {
        await window.electron.openExternal(
          `steam://rungameid/${game.appId}`
        );
      }
    } catch (err) {
      console.error("Failed to launch Steam game", err);
      showErrorToast(
        "Falha ao abrir jogo",
        `Não foi possível iniciar "${game.name}". Verifique se o Steam está rodando.`
      );
      setLaunchingGameIds((prev) => {
        const next = new Set(prev)
        next.delete(`steam:${game.appId}`)
        return next
      })
    }
  }, [showErrorToast, setLaunchingGameIds]);

  const handleFavoriteSteam = useCallback(async (game: SteamInstalledGame) => {
    const isFavorited = steamFavoritedIds.has(game.appId);
    try {
      if (isFavorited) {
        await window.electron.removeGameFromFavorites("steam", `steam_${game.appId}`);
      } else {
        await window.electron.addGameToFavorites("steam", `steam_${game.appId}`);
      }
      const next = new Set(steamFavoritedIds);
      if (isFavorited) {
        next.delete(game.appId);
      } else {
        next.add(game.appId);
      }
      setSteamFavoritedIds(next);
      localStorage.setItem("steam-favorited-ids", JSON.stringify([...next]));
      showSuccessToast(
        isFavorited ? "Removido dos favoritos" : "Adicionado aos favoritos",
        game.name
      );
    } catch (error) {
      console.error("Failed to toggle Steam favorite:", error);
      showErrorToast("Erro", "Não foi possível atualizar favoritos.");
    }
  }, [steamFavoritedIds, showSuccessToast, showErrorToast]);

  const handleConfigureSteamGame = useCallback((game: SteamInstalledGame) => {
    setSelectedSteamGame(game);
    onSetSelectedGame(steamToGameConfig(game));
    setShowConfigModal(true);
  }, [onSetSelectedGame, setShowConfigModal]);

  const handleOpenSteamContextMenu = useCallback(
    (game: SteamInstalledGame, position: { x: number; y: number }) => {
      const asGameConfig = steamToGameConfig(game);
      asGameConfig.favorite = steamFavoritedIds.has(game.appId);
      setGameContextMenu({
        game: asGameConfig,
        visible: true,
        position,
      });
    },
    [steamFavoritedIds, setGameContextMenu]
  );

  const handleClearSteamPrefix = useCallback(async (game: SteamInstalledGame) => {
    setClearingPrefix(true);
    try {
      const result = await window.electron.ensureGamePrefix(game.appId);
      if (result.success) {
        setSteamGames((prev) =>
          prev.map((g) =>
            g.appId === game.appId ? { ...g, hasPrefix: false } : g
          )
        );
        showSuccessToast("Prefixo configurado", "Prefixo recriado com o Proton atual.");
      } else {
        showErrorToast("Erro", result.error || "Falha ao recriar prefixo");
      }
    } finally {
      setClearingPrefix(false);
    }
  }, [showSuccessToast, showErrorToast, setClearingPrefix]);

  const handleSelectSteamGame = useCallback((game: SteamInstalledGame) => {
    setSelectedSteamGame(game);
    onSetSelectedGame(null);
  }, [onSetSelectedGame]);

  useEffect(() => {
    handleSyncSteam();
    (async () => {
      try {
        const modGames = await window.electron.modBridgeListGames();
        if (modGames.ok && Array.isArray(modGames.data)) {
          const steamIds = new Set<string>();
          const names = new Set<string>();
          for (const g of modGames.data as any[]) {
            if (g.steam_id) steamIds.add(g.steam_id);
            if (g.name) names.add(g.name.toLowerCase());
          }
          setModCompatibleSteamIds(steamIds);
          setModCompatibleNames(names);
        }
      } catch {
        // bridge not available, show all games
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    steamGames,
    setSteamGames,
    syncing,
    selectedSteamGame,
    setSelectedSteamGame,
    steamFavoritedIds,
    modCompatibleSteamIds,
    modCompatibleNames,
    showAllGames,
    setShowAllGames,
    handleSyncSteam,
    handlePlaySteam,
    handleFavoriteSteam,
    handleConfigureSteamGame,
    handleOpenSteamContextMenu,
    handleClearSteamPrefix,
    handleSelectSteamGame,
  };
}
