import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ProtonFork, ProtonInfo, InstalledProtonTool, ProtonToolGroup } from "../../types/proton.types";

export function useProtonConfig() {
  const [showProtonConfig, setShowProtonConfig] = useState(false);
  const [protonInfo, setProtonInfo] = useState<ProtonInfo | null>(null);
  const [protonConfigLoading, setProtonConfigLoading] = useState(false);
  const [protonConfigStatus, setProtonConfigStatus] = useState("");
  const [defaultPrefixPath, setDefaultPrefixPath] = useState("");
  const [selectedProtonPath, setSelectedProtonPath] = useState("");
  const [selectedFork, setSelectedFork] = useState<ProtonFork | null>(null);
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [setupFailed, setSetupFailed] = useState(false);
  const [installedTools, setInstalledTools] = useState<InstalledProtonTool[]>([]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reset = useCallback(() => {
    setSelectedProtonPath("");
    setSelectedFork(null);
    setSetupLog([]);
    setIsConfiguring(false);
    setSetupSuccess(false);
    setSetupFailed(false);
    setDownloadError(null);
  }, []);

  useEffect(() => {
    window.electron.getInstalledProtonTools().then((result) => {
      setInstalledTools(result as unknown as InstalledProtonTool[]);
    });
  }, []);

  const openConfig = useCallback(async (gameName: string) => {
    setProtonConfigLoading(true);
    setProtonConfigStatus("Iniciando...");
    setShowProtonConfig(true);
    setProtonInfo(null);
    setDefaultPrefixPath("");
    reset();

    const cleanup = window.electron.onProtonInfoProgress((progress) => {
      setProtonConfigStatus(progress.status);
    });

    try {
      const info = await window.electron.getGameProtonInfo(gameName) as unknown as ProtonInfo;
      setProtonInfo(info);
      setDefaultPrefixPath(info?.prefixPath || "");
      setProtonConfigStatus(info?.status || "");
    } catch (err) {
      setProtonInfo({ error: String(err) } as any);
      setProtonConfigStatus(`Erro: ${String(err)}`);
    } finally {
      setProtonConfigLoading(false);
      cleanup();
    }
  }, [reset]);

  const protonToolsInstalled = useMemo(() => {
    return installedTools.map(item => ({
      name: item.version || item.tool?.title || "",
      path: item.path,
    }));
  }, [installedTools]);

  const manualGroups = useMemo(() => {
    const map: Record<string, ProtonToolGroup> = {};
    const PROTON_TOOLS = (window as any).__PROTON_TOOLS__ || [];
    for (const item of installedTools) {
      const id = item.tool?.id || "unknown";
      if (!map[id]) {
        map[id] = {
          id,
          title: item.tool?.title || id,
          description: "",
          category: "proton",
          installed: [],
        };
      }
      map[id].installed.push({ version: item.version, path: item.path });
    }
    return Object.values(map)
      .filter(g => g.installed.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [installedTools]);

  const handleConfigure = useCallback(async (gameName: string) => {
    if (!selectedProtonPath || busyRef.current) return;
    busyRef.current = true;
    setIsConfiguring(true);
    setSetupLog([]);
    setSetupSuccess(false);
    setSetupFailed(false);

    const cleanup = window.electron.onProtonSetupLog((line: string) => {
      setSetupLog(prev => [...prev, line]);
    });

    try {
      // clean is always true (handled by backend)
      const prefixPath = info?.prefixPath || "";
      const result = await window.electron.setupProtonEnvironment(
        gameName, selectedProtonPath, prefixPath, true
      );
      if (!result.success) {
        setSetupLog(prev => [...prev, "", "✗ CONFIGURAÇÃO FALHOU"]);
        setSetupFailed(true);
      } else {
        setSetupLog(prev => [...prev, "", "✓ CONFIGURAÇÃO CONCLUÍDA"]);
        setSetupSuccess(true);
      }
    } catch (err) {
      setSetupLog(prev => [...prev, `Erro: ${String(err)}`]);
      setSetupFailed(true);
    } finally {
      cleanup();
      setIsConfiguring(false);
      busyRef.current = false;
    }
  }, [selectedProtonPath]);

  const handleDownloadFork = useCallback(async (fork: ProtonFork) => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError(null);
    const cleanup = window.electron.onProtonDownloadProgress?.((progress) => {
      if (progress) setDownloadProgress(progress.percent);
    });
    try {
      const protonPath = await (window.electron as any).downloadProton(fork);
      if (protonPath) {
        setDownloadProgress(100);
        setSelectedProtonPath(protonPath);
        setSelectedFork(null);
        const tools = await window.electron.getInstalledProtonTools();
        setInstalledTools(tools as unknown as InstalledProtonTool[]);
      } else {
        setDownloadError("Falha ao baixar Proton");
      }
    } catch (err: any) {
      setDownloadError(err?.message || "Falha ao baixar Proton");
    } finally {
      cleanup?.();
      setIsDownloading(false);
    }
  }, []);

  return {
    showProtonConfig,
    setShowProtonConfig,
    protonInfo,
    protonConfigLoading,
    protonConfigStatus,
    defaultPrefixPath,
    selectedProtonPath,
    setSelectedProtonPath,
    selectedFork,
    setSelectedFork,
    setupLog,
    isConfiguring,
    setupSuccess,
    setupFailed,
    installedTools,
    expandedTools,
    setExpandedTools,
    isDownloading,
    downloadProgress,
    downloadError,
    protonToolsInstalled,
    manualGroups,
    reset,
    openConfig,
    handleConfigure,
    handleDownloadFork,
  };
}
