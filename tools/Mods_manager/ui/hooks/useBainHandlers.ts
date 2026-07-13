import { useState, useCallback } from "react";

interface UseBainHandlersOpts {
  addLog: (msg: string) => void;
  loadMods: () => Promise<void>;
}

export function useBainHandlers({ addLog, loadMods }: UseBainHandlersOpts) {
  const [bainVisible, setBainVisible] = useState(false);
  const [bainLoading, setBainLoading] = useState(false);
  const [bainPackages, setBainPackages] = useState<{ order: number; name: string; directory: string; file_count: number }[]>([]);
  const [bainSelected, setBainSelected] = useState<Set<number>>(new Set());
  const [bainInstalling, setBainInstalling] = useState(false);
  const [bainError, setBainError] = useState<string | null>(null);
  const [bainArchivePath, setBainArchivePath] = useState("");
  const [bainModName, setBainModName] = useState("");
  const [bainStagingDir, setBainStagingDir] = useState("");

  const handleBainToggle = useCallback((order: number) => {
    setBainSelected(prev => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }, []);

  const handleBainInstall = useCallback(async () => {
    if (!bainStagingDir || bainSelected.size === 0) return;
    setBainInstalling(true);
    setBainError(null);
    try {
      const result = await window.electron.bainInstall(bainArchivePath, bainStagingDir, [...bainSelected]);
      if (result.ok) {
        addLog(`BAIN: ${result.data?.packages_installed} packages installed (${result.data?.files_extracted} files)`);
        setBainVisible(false);
        loadMods();
      } else {
        setBainError(result.error || "Install failed");
      }
    } catch (e) {
      setBainError(`Error: ${e}`);
    }
    setBainInstalling(false);
  }, [bainArchivePath, bainStagingDir, bainSelected, addLog, loadMods]);

  const openBainDialog = useCallback((modName: string, stagingDir: string, archivePath: string, packages: { order: number; name: string; directory: string; file_count: number }[]) => {
    setBainModName(modName);
    setBainStagingDir(stagingDir);
    setBainArchivePath(archivePath);
    setBainPackages(packages);
    setBainSelected(new Set(packages.map(p => p.order)));
    setBainError(null);
    setBainVisible(true);
  }, []);

  return {
    bainVisible,
    setBainVisible,
    bainLoading,
    bainPackages,
    bainSelected,
    bainInstalling,
    bainError,
    bainModName,
    bainStagingDir,
    handleBainToggle,
    handleBainInstall,
    openBainDialog,
  };
}
