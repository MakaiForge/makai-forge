import { useState, useEffect, useCallback } from "react";
import type { PluginEntry, ModlistEntry } from "../../types/mod.types";

const mkPluginsKey = (gameId: string, profile: string) =>
  `game:${gameId}:profile:${profile}:plugins`;

export function usePlugins(
  gameId: string,
  profile: string,
  mods: ModlistEntry[]
) {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPlugins = useCallback(async () => {
    if (!gameId || !profile) { setPlugins([]); return; }
    setLoading(true);
    try {
      const saved: PluginEntry[] | undefined =
        await window.electron.modsStore.get(mkPluginsKey(gameId, profile));
      const savedMap = new Map(
        (saved ?? []).map(p => [p.name.toLowerCase(), p])
      );
      const merged: PluginEntry[] = [];
      const seen = new Set<string>();

      for (const mod of mods) {
        for (const pluginName of mod.plugins ?? []) {
          const key = pluginName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const existing = savedMap.get(key);
          merged.push(
            existing ?? { name: pluginName, enabled: true, modName: mod.name }
          );
        }
      }
      setPlugins(merged);
    } catch {
      setPlugins([]);
    }
    setLoading(false);
  }, [gameId, profile, mods]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const persistPlugins = useCallback(
    async (updated: PluginEntry[]) => {
      if (!gameId || !profile) return;
      await window.electron.modsStore.put(
        mkPluginsKey(gameId, profile),
        updated
      );
    },
    [gameId, profile]
  );

  const togglePlugin = useCallback(
    (pluginName: string) => {
      setPlugins(prev => {
        const updated = prev.map(p =>
          p.name === pluginName ? { ...p, enabled: !p.enabled } : p
        );
        persistPlugins(updated);
        return updated;
      });
    },
    [persistPlugins]
  );

  return { plugins, togglePlugin, reloadPlugins: loadPlugins, loading };
}
