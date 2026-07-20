import { useState, useEffect } from "react";

interface CompatibleInfo {
  steamIds: Set<string>;
  names: Set<string>;
  loaded: boolean;
}

let cached: CompatibleInfo = { steamIds: new Set(), names: new Set(), loaded: false };
let loading = false;
let loadPromise: Promise<void> | null = null;

async function loadInfo(): Promise<void> {
  if (cached.loaded) return;
  if (loading && loadPromise) return loadPromise;
  loading = true;
  loadPromise = (async () => {
    try {
      const info = await window.electron.getModCompatibleInfo();
      cached = {
        steamIds: new Set(info.steamIds || []),
        names: new Set((info.names || []).map((n: string) => n.toLowerCase())),
        loaded: true,
      };
    } catch {
      cached.loaded = true;
    }
  })();
  await loadPromise;
  loading = false;
  loadPromise = null;
}

export function useModCompatibleGames() {
  const [ready, setReady] = useState(cached.loaded);

  useEffect(() => {
    if (cached.loaded) return;
    loadInfo().then(() => setReady(true));
  }, []);

  const isCompatible = (shop: string, objectId: string, title?: string): boolean => {
    if (!ready) return false;
    if (shop === "steam" && cached.steamIds.has(objectId)) return true;
    if (title && cached.names.has(title.toLowerCase())) return true;
    return false;
  };

  return { isCompatible, ready };
}
