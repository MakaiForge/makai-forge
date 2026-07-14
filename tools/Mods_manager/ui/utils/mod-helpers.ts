import type { ModlistEntry, GameEntry } from "../types/mod.types";

export function mergeGames(bridgeGames: GameEntry[], configGames: GameEntry[]): GameEntry[] {
  const map = new Map<string, GameEntry>();
  for (const g of bridgeGames) {
    const key = g.gameId || g.name;
    if (key) map.set(key, g);
  }
  for (const g of configGames) {
    const key = g.gameId || g.name;
    if (key && !map.has(key)) map.set(key, g);
  }
  return Array.from(map.values());
}

export function filterMods(mods: ModlistEntry[], query: string): ModlistEntry[] {
  if (!query) return mods;
  const q = query.toLowerCase();
  return mods.filter(m => m.name.toLowerCase().includes(q));
}

export function getEnabledMods(mods: ModlistEntry[]): { name: string; priority: number }[] {
  return mods
    .filter(m => m.enabled && !m.isSeparator)
    .map((m, i) => ({ name: m.name, priority: m.priority ?? i }));
}

export function collectPlugins(mods: ModlistEntry[]): { name: string; modName: string }[] {
  const all: { name: string; modName: string }[] = [];
  for (const mod of mods) {
    const plugins = mod.plugins;
    if (mod.enabled && plugins?.length) {
      for (const p of plugins) {
        all.push({ name: p, modName: mod.name });
      }
    }
  }
  return all;
}
