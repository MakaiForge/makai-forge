import { useState, useCallback } from "react";
import type { ProtonFork } from "@types";

interface UseProtonSetupOpts {
  configPrefixPath: string;
  selectedGame: string | null;
  configGamePath: string;
  configStagingDir: string;
  addLog: (msg: string) => void;
  saveGameConfig: (gameId: string, gamePath: string, stagingDir: string, extra?: Record<string, string>) => Promise<void>;
  setConfigProtonPath: (v: string) => void;
}

export function useProtonSetup({
  configPrefixPath,
  selectedGame,
  configGamePath,
  configStagingDir,
  addLog,
  saveGameConfig,
  setConfigProtonPath,
}: UseProtonSetupOpts) {
  const [prefixSetupVisible, setPrefixSetupVisible] = useState(false);
  const [prefixSetupGameName, setPrefixSetupGameName] = useState("");
  const [prefixSetupLog, setPrefixSetupLog] = useState<string[]>([]);
  const [prefixSetupResult, setPrefixSetupResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [originalProtonPath, setOriginalProtonPath] = useState<string>("");

  const setupProton = useCallback(async (gameName: string, protonPath: string) => {
    setPrefixSetupGameName(gameName);
    setPrefixSetupLog([`▶ Configurando ambiente Proton para ${gameName}...`]);
    setPrefixSetupResult(null);
    setPrefixSetupVisible(true);
    const cleanup = window.electron.onProtonSetupLog((line: string) => {
      setPrefixSetupLog(prev => [...prev, line]);
    });
    try {
      const prefixPath = configPrefixPath || "";
      const result = await window.electron.setupProtonEnvironment(gameName, protonPath, prefixPath, true);
      if (result.success) {
        setPrefixSetupLog(prev => [...prev, "", "✅ Ambiente Proton configurado com sucesso!"]);
        setPrefixSetupResult({ ok: true, msg: "✅ Configuração concluída!" });
      } else {
        setPrefixSetupLog(prev => [...prev, "", "❌ Configuração do Proton falhou"]);
        setPrefixSetupResult({ ok: false, msg: "❌ Configuração do Proton falhou" });
      }
    } catch (err) {
      setPrefixSetupLog(prev => [...prev, `❌ Erro: ${String(err)}`]);
      setPrefixSetupResult({ ok: false, msg: `Erro: ${String(err)}` });
    } finally {
      cleanup();
    }
  }, [configPrefixPath]);

  const saveGlobalProton = useCallback(async (protonPath: string) => {
    await window.electron.modsStore.put("proton_binary", protonPath);
    addLog(`Proton global salvo: ${protonPath}`);
  }, [addLog]);

  const handleProtonSelect = useCallback(async (protonPath: string) => {
    if (!selectedGame) return;
    setConfigProtonPath(protonPath);
    await saveGameConfig(selectedGame, configGamePath, configStagingDir);
    await saveGlobalProton(protonPath);
    addLog(`Proton salvo na config: ${protonPath}`);
    await setupProton(selectedGame, protonPath);
  }, [selectedGame, configGamePath, configStagingDir, saveGameConfig, setConfigProtonPath, addLog, setupProton, saveGlobalProton]);

  const handleDownloadAndSelect = useCallback(async (fork: ProtonFork) => {
    if (!selectedGame) return;

    const protonPath = await window.electron.downloadProton(fork);
    if (!protonPath) {
      addLog(`Falha ao baixar ${fork.name} ${fork.version}`);
      return;
    }

    setConfigProtonPath(protonPath);
    await saveGameConfig(selectedGame, configGamePath, configStagingDir);
    await saveGlobalProton(protonPath);
    addLog(`Proton baixado: ${protonPath}`);

    const info = await window.electron.getModGameInfo(selectedGame);
    const steamAppId = info?.steamAppId;
    if (steamAppId) {
      const protonName = protonPath.replace(/\/+$/, '').split(/[\\/]/).pop() || '';
      if (protonName) {
        await window.electron.setSteamGameProton(steamAppId, protonName);
        addLog(`Steam configurado: ${selectedGame} → ${protonName}`);
      }
    }

    await setupProton(selectedGame, protonPath);
  }, [selectedGame, configGamePath, configStagingDir, saveGameConfig, setConfigProtonPath, addLog, setupProton, saveGlobalProton]);

  const handleSwitchProton = useCallback(async (newProtonPath: string) => {
    if (!selectedGame) return;
    addLog(`Iniciando troca de Proton: ${configPrefixPath} → ${newProtonPath}`);
    const result = await window.electron.switchProton(selectedGame, newProtonPath);
    if (result.ok) {
      setConfigProtonPath(newProtonPath);
      setOriginalProtonPath(newProtonPath);
      addLog(`Proton trocado com sucesso! Saves restaurados: ${result.data?.savesRestored ?? 0}`);
    } else {
      addLog(`Falha na troca: ${result.error}`);
    }
    return result;
  }, [selectedGame, configPrefixPath, setConfigProtonPath, addLog]);

  return {
    prefixSetupVisible,
    setPrefixSetupVisible,
    prefixSetupGameName,
    prefixSetupLog,
    prefixSetupResult,
    originalProtonPath,
    setOriginalProtonPath,
    setupProton,
    saveGlobalProton,
    handleProtonSelect,
    handleDownloadAndSelect,
    handleSwitchProton,
  };
}
