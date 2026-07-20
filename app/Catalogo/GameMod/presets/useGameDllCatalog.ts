import { useState, useEffect, useCallback } from "react";
import type { GameDllEntry, GameDllCatalog } from "../data/game-dlls";

interface UseGameDllCatalogResult {
  catalog: GameDllEntry[];
  loading: boolean;
  error: string | null;
  getGameInfo: (gameId: string) => GameDllEntry | undefined;
  reload: () => void;
}

export function useGameDllCatalog(): UseGameDllCatalogResult {
  const [catalog, setCatalog] = useState<GameDllEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.getGameDllCatalog();
      if (result.ok && result.data) {
        setCatalog(result.data.games);
      } else {
        setError(result.error || "Falha ao carregar catálogo");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao carregar catálogo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getGameInfo = useCallback(
    (gameId: string) => catalog.find((g) => g.gameId === gameId),
    [catalog]
  );

  return { catalog, loading, error, getGameInfo, reload: load };
}
