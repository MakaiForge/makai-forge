import { useState, useEffect, useCallback } from "react";
import type { ModlistEntry, ModMedia } from "../../types/mod.types";
import { filterMods } from "../../utils/mod-helpers";

export function useMods(gameId: string, profile: string) {
  const [mods, setMods] = useState<ModlistEntry[]>([]);
  const [filteredMods, setFilteredMods] = useState<ModlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaMap, setMediaMap] = useState<Record<string, ModMedia>>({});
  const [selectedModIdx, setSelectedModIdx] = useState<number | null>(null);

  const loadMods = useCallback(async () => {
    if (!gameId || !profile) return;
    try {
      setLoading(true);
      const items: ModlistEntry[] = (await window.electron.modsStore.get(
        `game:${gameId}:profile:${profile}:modlist`
      )) as ModlistEntry[] || [];

      // Load inventory for each mod (needed for conflict detection)
      const itemsWithInventory = await Promise.all(
        items.map(async (mod) => {
          if (mod.isSeparator || mod.inventory) return mod;
          try {
            const invKey = `game:${gameId}:mod:${mod.name}:inventory`;
            const inventory = await window.electron.modsStore.get(invKey);
            return { ...mod, inventory: inventory || undefined };
          } catch {
            return mod;
          }
        })
      );

      setMods(itemsWithInventory);
      setFilteredMods(filterMods(itemsWithInventory, searchQuery));

      const stagingDirs = itemsWithInventory.filter(m => m.stagingDir).map(m => m.stagingDir!);
      if (stagingDirs.length > 0) {
        const media = await window.electron.checkModsMedia(stagingDirs);
        const map: Record<string, ModMedia> = {};
        for (const mod of itemsWithInventory) {
          if (mod.stagingDir) {
            map[mod.name] = media[mod.stagingDir] || { hasPreview: false, hasReadme: false };
          }
        }
        setMediaMap(map);
      } else {
        setMediaMap({});
      }
    } catch {
      setMods([]);
      setFilteredMods([]);
    } finally {
      setLoading(false);
    }
  }, [gameId, profile]);

  useEffect(() => {
    loadMods();
  }, [loadMods]);

  useEffect(() => {
    setFilteredMods(filterMods(mods, searchQuery));
  }, [mods, searchQuery]);

  const persistMods = useCallback(async (updated: ModlistEntry[]) => {
    await window.electron.modsStore.put(
      `game:${gameId}:profile:${profile}:modlist`,
      updated
    );
  }, [gameId, profile]);

  const toggleMod = useCallback(async (filterIdx: number) => {
    const realIdx = mods.indexOf(filteredMods[filterIdx]);
    if (realIdx === -1) return;
    const updated = mods.map((m, i) =>
      i === realIdx ? { ...m, enabled: !m.enabled } : m
    );
    setMods(updated);
    await persistMods(updated);
    return updated[realIdx];
  }, [mods, filteredMods, persistMods]);

  const reorderMods = useCallback((fromIdx: number, toIdx: number) => {
    const updated = [...filteredMods];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setFilteredMods(updated);
    setMods(updated);
    persistMods(updated);
  }, [filteredMods, persistMods]);

  const removeMod = useCallback(async (modName: string) => {
    try {
      await window.electron.removeMod(gameId, profile, modName);
      const updated = mods.filter(m => m.name !== modName);
      setMods(updated);
      setSelectedModIdx(null);
      return true;
    } catch {
      return false;
    }
  }, [gameId, profile, mods]);

  const deleteMod = useCallback(async (modName: string) => {
    try {
      await window.electron.deleteMod(gameId, profile, modName);
      const updated = mods.filter(m => m.name !== modName);
      setMods(updated);
      setSelectedModIdx(null);
      return true;
    } catch {
      return false;
    }
  }, [gameId, profile, mods]);

  const installMod = useCallback(async (archivePath: string): Promise<ModlistEntry | null> => {
    try {
      const config = { gameId, profile, verifyAfterExtract: true };
      const result = await window.electron.installModOrchestrated(archivePath, config);
      await loadMods();
      if (result.success) {
        return {
          name: result.modName,
          enabled: true,
          version: "",
          priority: 0,
          isSeparator: false,
          stagingDir: result.stagingDir,
          plugins: result.plugins,
          hasFomod: result.hasFomod,
          hasSkse: result.hasSkse,
          category: result.category,
        } as ModlistEntry;
      }
      return null;
    } catch {
      return null;
    }
  }, [gameId, profile, loadMods]);

  return {
    mods,
    filteredMods,
    loading,
    searchQuery,
    setSearchQuery,
    mediaMap,
    selectedModIdx,
    setSelectedModIdx,
    loadMods,
    toggleMod,
    reorderMods,
    removeMod,
    deleteMod,
    installMod,
  };
}
