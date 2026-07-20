import { useState, useCallback, useRef } from "react";
import * as api from "../services/proton-api";
import type { ProtonRelease } from "../types";

export function useReleases() {
  const [releases, setReleases] = useState<Record<string, ProtonRelease[]>>({});
  const [loading, setLoading] = useState(false);
  const releasesRef = useRef<Record<string, ProtonRelease[]>>({});

  const loadReleases = useCallback(async (toolId: string) => {
    if (releasesRef.current[toolId]) return releasesRef.current[toolId];

    setLoading(true);
    try {
      const data = await api.getProtonReleases(toolId);
      const rels = (data || []) as ProtonRelease[];
      setReleases((prev) => ({ ...prev, [toolId]: rels }));
      releasesRef.current = { ...releasesRef.current, [toolId]: rels };
      return rels;
    } catch (e) {
      console.error(`Failed to load ${toolId}:`, e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { releases, loading, loadReleases };
}
