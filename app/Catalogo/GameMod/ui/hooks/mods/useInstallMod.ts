import { useState, useCallback, useEffect, useRef } from "react";

export interface InstallProgress {
  stage: string;
  percent: number;
  message: string;
  modName: string;
}

export type InstallResult =
  | { ok: true; modName: string }
  | { ok: false; modName?: string; error: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

interface ModExistsCheck {
  exists: boolean;
  modName: string;
  stagingPath: string;
  inProfile: boolean;
}

export function useInstallMod(
  gameId: string,
  profile: string,
  addLog: (msg: string) => void,
  onFomodOpen: (stagingDir: string, archivePath: string, modName: string) => void,
  onRefresh: () => void,
  onModInstalled?: (modName: string) => void,
  onBainOpen?: (modName: string, stagingDir: string, archivePath: string, packages: { order: number; name: string; directory: string; file_count: number }[]) => void,
) {
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingMod, setPendingMod] = useState<{ archivePath: string; modName: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const dismissResult = useCallback(() => setInstallResult(null), []);

  const setInstallingState = useCallback((value: boolean) => {
    installingRef.current = value;
    setInstalling(value);
  }, []);

  useEffect(() => {
    const cleanup = window.electron.onModInstallProgress?.((data) => {
      if (!installingRef.current) return;
      setInstallProgress(data);
    });
    return () => cleanup?.();
  }, []);

  const pickAndInstall = useCallback(async () => {
    try {
      const result = await window.electron.showOpenDialog({
        title: "Select Mod Archive",
        filters: [
          { name: "Mod Archives", extensions: ["zip", "7z", "rar", "fomod", "tar.gz"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths.length) return;
      const archivePath = result.filePaths[0];
      addLog(`Selected: ${archivePath}`);

      const { exists, modName, stagingPath, inProfile } = await window.electron.checkModExists(archivePath, gameId, profile);
      if (exists && inProfile) {
        // Mod exists AND is in current profile → show overwrite modal
        setPendingMod({ archivePath, modName });
        setShowOverwriteModal(true);
        return modName;
      }

      if (exists && !inProfile) {
        // Mod exists on disk but NOT in this profile → just add to modlist, skip extraction
        addLog(`Mod "${modName}" already installed in staging, adding to profile "${profile}"...`);
        await doInstall(archivePath, modName);
        return modName;
      }

      await doInstall(archivePath, modName);
      return modName;
    } catch (err) {
      addLog(`Failed to prepare install: ${String(err)}`);
      return null;
    }
  }, [gameId, addLog]);

  const confirmOverwrite = useCallback(async () => {
    if (!pendingMod) return;
    setShowOverwriteModal(false);
    setInstallingState(true);
    try {
      await doInstall(pendingMod.archivePath, pendingMod.modName, true);
    } finally {
      setInstallingState(false);
      setPendingMod(null);
    }
  }, [pendingMod]);

  const cancelOverwrite = useCallback(() => {
    setShowOverwriteModal(false);
    setPendingMod(null);
    addLog("Install cancelled — mod already exists");
  }, [addLog]);

  const doInstall = useCallback(async (archivePath: string, modName: string, overwrite?: boolean) => {
    setInstallingState(true);
    addLog(`Installing: ${modName}`);
    try {
      const config = { gameId, profile, verifyAfterExtract: true };
      const result = await withTimeout(
        window.electron.installModOrchestrated(archivePath, config),
        180000,
        "installModOrchestrated",
      );
      
      if (!result.success) {
        addLog(`Install failed: ${result.error}`);
        setInstallResult({ ok: false, modName, error: result.error || "Installation failed" });
        return;
      }

      addLog(`Installed: ${result.modName} (${result.plugins.length} plugins, FOMOD: ${result.hasFomod})`);

      // IPC retornou — instalação concluída no backend
      setInstallProgress(null);

      if (result.hasFomod) {
        await withTimeout(onRefresh(), 30000, "onRefresh");
        onFomodOpen(result.stagingDir, archivePath, result.modName);
        return;
      }

      // BAIN packages
      const bainResult = await withTimeout(window.electron.bainDetect(archivePath), 60000, "bainDetect");
      if (bainResult.ok && bainResult.is_bain && bainResult.data?.packages?.length) {
        await withTimeout(onRefresh(), 30000, "onRefresh");
        onBainOpen?.(result.modName, result.stagingDir, archivePath, bainResult.data.packages);
        return;
      }

      // Instalação direta — mostra resultado imediatamente
      setInstallResult({ ok: true, modName: result.modName });

      // Recarrega a lista em background e auto-select
      await withTimeout(onRefresh(), 30000, "onRefresh");
      onModInstalled?.(result.modName);
    } catch (err) {
      const msg = String(err);
      if (/password|encrypted/i.test(msg)) {
        const pw = window.prompt(`Archive "${modName}" is password-protected.\nEnter password:`);
        if (pw !== null) {
          try {
            const config = { gameId, profile, verifyAfterExtract: true, password: pw };
            const result = await withTimeout(
              window.electron.installModOrchestrated(archivePath, config),
              180000,
              "installModOrchestrated",
            );
            
            if (!result.success) {
              addLog(`Install failed: ${result.error}`);
              setInstallResult({ ok: false, modName, error: result.error || "Installation failed" });
              return;
            }

            addLog(`Installed: ${result.modName} (${result.plugins.length} plugins, FOMOD: ${result.hasFomod})`);
            setInstallProgress(null);
            if (result.hasFomod) {
              await withTimeout(onRefresh(), 30000, "onRefresh");
              onFomodOpen(result.stagingDir, archivePath, result.modName);
              return;
            }
            const bainResult = await withTimeout(window.electron.bainDetect(archivePath), 60000, "bainDetect");
            if (bainResult.ok && bainResult.is_bain && bainResult.data?.packages?.length) {
              await withTimeout(onRefresh(), 30000, "onRefresh");
              onBainOpen?.(result.modName, result.stagingDir, archivePath, bainResult.data.packages);
              return;
            }
            setInstallResult({ ok: true, modName: result.modName });
            await withTimeout(onRefresh(), 30000, "onRefresh");
            onModInstalled?.(result.modName);
          } catch (pwErr) {
            addLog(`Install failed: wrong password or corrupt archive`);
            setInstallResult({ ok: false, modName, error: "Senha incorreta ou archive corrompido" });
          }
        } else {
          addLog(`Install cancelled — password required`);
          setInstallResult({ ok: false, modName, error: "Instalação cancelada (senha necessária)" });
        }
      } else {
        addLog(`Install error: ${msg}`);
        setInstallResult({ ok: false, modName, error: msg });
      }
    } finally {
      setInstallingState(false);
      setInstallProgress(null);
    }
  }, [gameId, profile, addLog, onFomodOpen, onRefresh, onModInstalled, onBainOpen]);

  return {
    installing,
    installProgress,
    installResult,
    dismissResult,
    showOverwriteModal,
    pendingMod,
    pickAndInstall,
    confirmOverwrite,
    cancelOverwrite,
  };
}
