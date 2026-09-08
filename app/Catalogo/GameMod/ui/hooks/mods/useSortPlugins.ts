import { useState, useCallback } from "react";
import type { ModlistEntry, PluginEntry } from "../../types/mod.types";

export function useSortPlugins(
  selectedGame: string | null,
  plugins: PluginEntry[],
  mods: ModlistEntry[],
  addLog: (msg: string) => void,
) {
  const [sorting, setSorting] = useState(false);
  const [sortWarnings, setSortWarnings] = useState<string[]>([]);

  const handleSortPlugins = useCallback(async () => {
    if (!selectedGame || !plugins) return;
    setSorting(true);
    setSortWarnings([]);
    try {
      const result = await window.electron.modLoadOrderSort(
        selectedGame,
        plugins.map(p => ({ filename: p.name, masters: [] }))
      );
      if (result.ok && result.data) {
        const sortedNames = result.data.sorted.map(s => s.filename);
        const modToPlugins = new Map<string, string[]>();
        for (const mod of mods) {
          if (mod.plugins) {
            for (const plugin of mod.plugins) {
              if (!modToPlugins.has(mod.name)) modToPlugins.set(mod.name, []);
              modToPlugins.get(mod.name)!.push(plugin);
            }
          }
        }
        mods.sort((a, b) => {
          const aPlugins = modToPlugins.get(a.name) ?? [];
          const bPlugins = modToPlugins.get(b.name) ?? [];
          const aIdx = aPlugins.length > 0 ? sortedNames.indexOf(aPlugins[0]) : -1;
          const bIdx = bPlugins.length > 0 ? sortedNames.indexOf(bPlugins[0]) : -1;
          if (aIdx === -1 && bIdx === -1) return (a.priority ?? 0) - (b.priority ?? 0);
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });
        if (result.data.warnings.length > 0) {
          setSortWarnings(result.data.warnings);
        }
        if (result.data.validation.length > 0) {
          addLog(`Load order: ${result.data.validation.length} issues found`);
        }
        addLog(`Sorted ${result.data.sorted.length} plugins via masterlist`);
      }
    } catch (err) {
      setSortWarnings([`Sort failed: ${String(err)}`]);
    } finally {
      setSorting(false);
    }
  }, [selectedGame, plugins, mods, addLog]);

  return { sorting, sortWarnings, handleSortPlugins };
}
