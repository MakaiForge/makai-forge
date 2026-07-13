import { useCallback } from "react";
import type { ModlistEntry } from "../types/mod.types";

interface UseModActionsOpts {
  selectedGame: string | null;
  selectedModIdx: number | null;
  filteredMods: ModlistEntry[];
  mods: ModlistEntry[];
  addLog: (msg: string) => void;
  removeMod: (name: string) => void;
  deleteMod: (name: string) => void;
  toggleMod: (idx: number) => void;
  setSelectedModIdx: (v: number | null | ((prev: number | null) => number | null)) => void;
  detectAndShowConflicts: (mods: { name: string; priority: number }[]) => void;
}

export function useModActions({
  selectedGame,
  selectedModIdx,
  filteredMods,
  mods,
  addLog,
  removeMod,
  deleteMod,
  toggleMod,
  setSelectedModIdx,
  detectAndShowConflicts,
}: UseModActionsOpts) {
  const handleRemoveMod = useCallback(() => {
    if (selectedModIdx === null || !filteredMods[selectedModIdx]) return;
    const modName = filteredMods[selectedModIdx].name;
    if (!window.confirm(`Remove "${modName}"?`)) return;
    addLog(`Removing mod: ${modName}`);
    removeMod(modName);
    setSelectedModIdx(null);
    addLog(`Removed: ${modName}. Re-deploy to apply.`);
  }, [selectedModIdx, filteredMods, addLog, removeMod, setSelectedModIdx]);

  const handleDeleteMod = useCallback((modName: string) => {
    if (!window.confirm(`Permanently delete "${modName}"? This will remove staging files.`)) return;
    addLog(`Deleting mod: ${modName}`);
    deleteMod(modName);
    setSelectedModIdx(null);
    addLog(`Deleted: ${modName}.`);
  }, [addLog, deleteMod]);

  const handleEslify = useCallback(async (modName: string) => {
    if (!selectedGame) return;
    const mod = mods.find(m => m.name === modName);
    if (!mod?.stagingDir) {
      addLog(`Cannot ESLify: no staging dir for ${modName}`);
      return;
    }
    const espPlugins = mod.plugins?.filter(p => p.toLowerCase().endsWith(".esp")) || [];
    if (espPlugins.length === 0) {
      addLog(`${modName}: no .esp plugins to ESLify`);
      return;
    }
    addLog(`ESLifying ${modName}...`);
    for (const plugin of espPlugins) {
      const pluginPath = `${mod.stagingDir}/${plugin}`;
      try {
        const result = await window.electron.eslify(pluginPath, false, true);
        if (result.success) {
          addLog(`  ✅ ${plugin} → ESL (safe: ${result.safe})`);
        } else {
          addLog(`  ❌ ${plugin}: ${result.error || "failed"}`);
        }
      } catch (e) {
        addLog(`  ❌ ${plugin}: ${e}`);
      }
    }
  }, [selectedGame, mods, addLog]);

  const handleConflictClick = useCallback((mod: ModlistEntry) => {
    // Returns the mod so the caller can manage the state
    return mod;
  }, []);

  const handleApplyConflictResolution = useCallback((deselectedMods: string[]) => {
    for (const modName of deselectedMods) {
      const idx = mods.findIndex(m => m.name === modName);
      if (idx !== -1 && mods[idx].enabled) {
        toggleMod(idx);
      }
    }
  }, [mods, toggleMod]);

  const handleDeployClick = useCallback(async () => {
    detectAndShowConflicts(mods.filter(m => m.enabled && !m.isSeparator).map((m, i) => ({ name: m.name, priority: m.priority ?? i })));
  }, [mods, detectAndShowConflicts]);

  return {
    handleRemoveMod,
    handleDeleteMod,
    handleEslify,
    handleConflictClick,
    handleApplyConflictResolution,
    handleDeployClick,
  };
}
