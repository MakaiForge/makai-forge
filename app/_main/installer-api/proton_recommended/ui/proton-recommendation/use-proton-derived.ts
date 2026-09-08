import { useMemo } from "react";
import type { ProtonFork } from "@types";
import type { CatalogFork, ManualGroup } from "./types";

export function useProtonDerived(
  forkCatalog: any[],
  installedTools: any[],
  allTools: any[],
  allForks: ProtonFork[]
) {
  const forkInfoMap = useMemo(() => {
    const map: Record<string, any> = {};
    forkCatalog.forEach((f: any) => {
      map[f.id] = {
        versions: f.versions || [],
        name: f.name,
        tierScore: f.tierScore,
        ranking: f.ranking,
      };
    });
    return map;
  }, [forkCatalog]);

  const catalogForks = useMemo<CatalogFork[]>(
    () =>
      (forkCatalog as any[])
        .map((f) => ({
          id: String(f.id),
          name: f.name || String(f.id),
          ranking: f.ranking || "unknown",
          tierScore: f.tierScore ?? 0,
          versions: Array.isArray(f.versions) ? f.versions : [],
        }))
        .sort(
          (a, b) => b.tierScore - a.tierScore || a.name.localeCompare(b.name)
        ),
    [forkCatalog]
  );

  const recommendedForkIds = useMemo(() => {
    const s = new Set<string>();
    allForks.forEach((f) => s.add(f.fork));
    return s;
  }, [allForks]);

  const manualGroups = useMemo<ManualGroup[]>(() => {
    const map: Record<string, ManualGroup> = {};
    const toolConfigMap: Record<string, any> = {};
    allTools.forEach((t: any) => {
      toolConfigMap[t.id] = t;
    });
    installedTools.forEach((item: any) => {
      const id = item.tool?.id || "unknown";
      if (!map[id]) {
        const cfg = toolConfigMap[id];
        map[id] = {
          id,
          title: cfg?.title || item.tool?.title || id,
          description: cfg?.description || "",
          category: cfg?.category || "proton",
          installed: [],
        };
      }
      map[id].installed.push({ version: item.version, path: item.path });
    });
    return Object.entries(map)
      .filter(([_, g]) => g.installed.length > 0)
      .sort((a, b) => {
        if (a[1].category !== b[1].category)
          return a[1].category === "proton" ? -1 : 1;
        return a[1].title.localeCompare(b[1].title);
      })
      .map(([_, g]) => g);
  }, [installedTools, allTools]);

  return { forkInfoMap, catalogForks, recommendedForkIds, manualGroups };
}
