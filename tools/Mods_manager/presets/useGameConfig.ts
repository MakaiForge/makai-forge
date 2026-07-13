import { useState, useEffect, useCallback } from "react";
import type { GameEntry } from "../ui/types/mod.types";
import type { BridgeGameInfo } from "../ui/types/bridge.types";
import { mergeGames } from "../ui/utils/mod-helpers";
import { bridgeListGames, bridgeDiscoverGames } from "../ui/utils/bridge-helpers";

function defaultStagingDir(_gameId: string, gameName: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const slug = gameName.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `${home}/Games/Mods/${slug}/staging`;
}

function defaultPrefixDir(_gameId: string, gameName: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const slug = gameName.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `${home}/Games/Prefix/${slug}`;
}

async function autoDetectGamePath(gameId: string): Promise<string | null> {
  try {
    return await window.electron.modDetectGamePath(gameId);
  } catch { return null; }
}

function gameIdFor(entry: GameEntry): string {
  return entry.gameId || entry.name;
}

export function useGameConfig() {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [selectedGame, setSelectedGame] = useState<string>("");
  const [configGamePath, setConfigGamePath] = useState("");
  const [configStagingDir, setConfigStagingDir] = useState("");
  const [configPrefixPath, setConfigPrefixPath] = useState("");
  const [configProtonPath, setConfigProtonPath] = useState("");
  const [showGameConfig, setShowGameConfig] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const bridgeResult = await bridgeListGames();
        const bridgeGames: GameEntry[] = [];
        if (bridgeResult.ok && Array.isArray(bridgeResult.data)) {
          for (const bg of bridgeResult.data as BridgeGameInfo[]) {
            if (!bridgeGames.find(g => g.gameId === bg.game_id)) {
              bridgeGames.push({ name: bg.name, gameId: bg.game_id, path: bg.game_path || "" });
            }
          }
        }
        const configs = await window.electron.listGameConfigs();
        const configGames: GameEntry[] = configs.map(c => ({
          name: c.name,
          gameId: c.name,
          path: c.config.gamePath || "",
        }));
        const merged = mergeGames(bridgeGames, configGames);
        setGames(merged);
        setSelectedGame(prev => prev || (merged.length > 0 ? gameIdFor(merged[0]) : ""));
      } catch { setGames([]); }
    })();
  }, []);

  const currentGame = games.find(g => gameIdFor(g) === selectedGame) || null;

  useEffect(() => {
    if (!selectedGame) return;
    (async () => {
      const existing = await window.electron.getGameConfig(selectedGame);
      if (existing?.gamePath) return;

      const detectedPath = await autoDetectGamePath(selectedGame);
      if (detectedPath) {
        const name = currentGame?.name || selectedGame;
        const staging = defaultStagingDir(selectedGame, name);
        const prefix = defaultPrefixDir(selectedGame, name);
        await window.electron.saveGameConfig(selectedGame, {
          gamePath: detectedPath,
          stagingDir: staging,
          protonPrefix: prefix,
          protonVersion: "",
        });
        setGames(prev => prev.map(g =>
          gameIdFor(g) === selectedGame ? { ...g, path: detectedPath } : g
        ));
      }
    })();
  }, [selectedGame, currentGame]);

  useEffect(() => {
    if (!selectedGame) return;
    (async () => {
      try {
        const cfg = await window.electron.getGameConfig(selectedGame);
        const name = currentGame?.name || selectedGame;
        if (cfg) {
          setConfigGamePath(cfg.gamePath || "");
          setConfigStagingDir(cfg.stagingDir || defaultStagingDir(selectedGame, name));
          setConfigPrefixPath(cfg.protonPrefix || defaultPrefixDir(selectedGame, name));
          setConfigProtonPath(cfg.protonVersion || "");
        } else {
          setConfigGamePath("");
          setConfigStagingDir(defaultStagingDir(selectedGame, name));
          setConfigPrefixPath(defaultPrefixDir(selectedGame, name));
          setConfigProtonPath("");
        }
      } catch {
        const name = currentGame?.name || selectedGame;
        setConfigStagingDir(defaultStagingDir(selectedGame, name));
        setConfigPrefixPath(defaultPrefixDir(selectedGame, name));
      }
    })();
  }, [selectedGame, currentGame]);

  const saveGameConfig = useCallback(async (name: string, gamePath: string, stagingDir: string, extra?: Record<string, string>) => {
    const gameId = name;
    await window.electron.saveGameConfig(gameId, {
      gamePath,
      stagingDir: stagingDir || defaultStagingDir(gameId, name),
      protonPrefix: extra?.protonPrefix ?? configPrefixPath,
      protonVersion: extra?.protonVersion ?? configProtonPath,
    });
    setGames(prev => {
      if (prev.find(g => gameIdFor(g) === gameId)) return prev;
      return [...prev, { name, gameId, path: gamePath }];
    });
  }, [configPrefixPath, configProtonPath]);

  const discoverInstalledGames = useCallback(async () => {
    try {
      const result = await bridgeDiscoverGames();
      if (result.ok && Array.isArray(result.data)) {
        for (const g of result.data) {
          const sd = defaultStagingDir(g.game_id, g.name);
          const pp = defaultPrefixDir(g.game_id, g.name);
          await window.electron.saveGameConfig(g.game_id, {
            gamePath: g.path,
            stagingDir: sd,
            protonPrefix: pp,
          });
          setGames(prev => {
            if (prev.find(x => gameIdFor(x) === g.game_id)) return prev;
            return [...prev, { name: g.name, gameId: g.game_id, path: g.path }];
          });
        }
        return result.data.length;
      }
    } catch { /* ignore */ }
    return 0;
  }, []);

  return {
    games,
    setGames,
    selectedGame,
    setSelectedGame,
    currentGame,
    configGamePath,
    setConfigGamePath,
    configStagingDir,
    setConfigStagingDir,
    configPrefixPath,
    setConfigPrefixPath,
    configProtonPath,
    setConfigProtonPath,
    showGameConfig,
    setShowGameConfig,
    saveGameConfig,
    discoverInstalledGames,
  };
}
