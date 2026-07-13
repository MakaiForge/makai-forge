import { useCallback } from "react";

interface UseGameConfigActionsOpts {
  selectedGame: string | null;
  configGamePath: string;
  configStagingDir: string;
  configPrefixPath: string;
  configProtonPath: string;
  addLog: (msg: string) => void;
  saveGameConfig: (gameId: string, gamePath: string, stagingDir: string, extra?: Record<string, string>) => Promise<void>;
  setSelectedGame: (v: string | null) => void;
  setGames: (updater: (prev: any[]) => any[]) => void;
  setConfigGamePath: (v: string) => void;
  setConfigStagingDir: (v: string) => void;
  setConfigPrefixPath: (v: string) => void;
  setShowGameConfig: (v: boolean) => void;
  discoverInstalledGames: () => Promise<number>;
}

export function useGameConfigActions({
  selectedGame,
  configGamePath,
  configStagingDir,
  configPrefixPath,
  configProtonPath,
  addLog,
  saveGameConfig,
  setSelectedGame,
  setGames,
  setConfigGamePath,
  setConfigStagingDir,
  setConfigPrefixPath,
  setShowGameConfig,
  discoverInstalledGames,
}: UseGameConfigActionsOpts) {
  const handleSaveGameConfig = useCallback(async () => {
    if (!selectedGame) {
      const gameName = prompt("Enter game name:") || "";
      if (!gameName) return;
      await saveGameConfig(gameName, configGamePath, configStagingDir, {
        protonPrefix: configPrefixPath,
        protonVersion: configProtonPath,
      });
      setGames(prev => [...prev, { name: gameName, gameId: gameName, path: configGamePath }]);
      setSelectedGame(gameName);
    } else {
      await saveGameConfig(selectedGame, configGamePath, configStagingDir, {
        protonPrefix: configPrefixPath,
        protonVersion: configProtonPath,
      });
      addLog(`Saved config for ${selectedGame}`);
    }
    setShowGameConfig(false);
  }, [selectedGame, configGamePath, configStagingDir, configPrefixPath, configProtonPath, saveGameConfig, setGames, setSelectedGame, addLog, setShowGameConfig]);

  const handleDetectionWizardGame = useCallback(async (gameId: string, gamePath: string) => {
    const slug = gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
    const homeDir = await window.electron.getHomeDir();
    const home = homeDir || "/home/" + (process.env.USER || "user");
    const staging = home + "/Games/Mods/" + slug + "/staging";
    const prefix = home + "/Games/Prefix/" + slug;
    setConfigStagingDir(staging);
    setConfigPrefixPath(prefix);
    await window.electron.saveGameConfig(gameId, {
      gamePath,
      stagingDir: staging,
      protonPrefix: prefix,
      protonVersion: "",
    });
    setSelectedGame(gameId);
    setConfigGamePath(gamePath);
    addLog(`Jogo detectado: ${gameId} em ${gamePath}`);
  }, [setSelectedGame, setConfigGamePath, setConfigStagingDir, setConfigPrefixPath, addLog]);

  const handleDiscover = useCallback(async () => {
    const count = await discoverInstalledGames();
    if (count > 0) addLog(`Discovered ${count} game(s)`);
  }, [discoverInstalledGames, addLog]);

  return {
    handleSaveGameConfig,
    handleDetectionWizardGame,
    handleDiscover,
  };
}
