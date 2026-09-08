import { useState, useCallback } from "react";
import type { FileConflict } from "../../types/mod.types";

export function useDeploy(selectedGame: string, selectedProfile: string, addLog: (msg: string) => void) {
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; log: string[]; filemap: Record<string, string> } | null>(null);
  const [conflicts, setConflicts] = useState<FileConflict[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);

  const handleDeploy = useCallback(async (bsaInvalidate?: boolean) => {
    setDeploying(true);
    addLog("Starting deployment...");
    try {
      const result = await window.electron.deployMods(selectedGame, selectedProfile);
      if (result.success) {
        addLog("Deployment successful");
        setDeployResult({ success: true, log: result.log, filemap: result.filemap });
        if (bsaInvalidate) {
          try {
            const config: { gamePath?: string } | null = await window.electron.getGameConfig(selectedGame);
            if (config?.gamePath) {
              addLog("Running BSA Invalidation...");
              await window.electron.bsaInvalidate(config.gamePath, selectedGame, true);
              addLog("BSA Invalidation complete");
            }
          } catch (e) {
            addLog(`BSA Invalidation failed: ${String(e)}`);
          }
        }
      } else {
        addLog(`Deploy failed`);
        setDeployResult({ success: false, log: result.log, filemap: {} });
      }
    } catch (err) {
      addLog(`Deploy error: ${String(err)}`);
      setDeployResult({ success: false, log: [String(err)], filemap: {} });
    } finally {
      setDeploying(false);
    }
  }, [selectedGame, selectedProfile, addLog]);

  const detectAndShowConflicts = useCallback(async (enabledMods: { name: string; priority: number }[]) => {
    if (!selectedGame) return;
    const result = await window.electron.detectConflicts(selectedGame, enabledMods);
    setConflicts(result);
    if (result.length > 0) {
      setShowConflicts(true);
    } else {
      setShowDeployConfirm(true);
    }
  }, [selectedGame]);

  return {
    deploying,
    deployResult,
    setDeployResult,
    conflicts,
    showConflicts,
    setShowConflicts,
    showDeployConfirm,
    setShowDeployConfirm,
    handleDeploy,
    detectAndShowConflicts,
  };
}
