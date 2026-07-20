import type { CatalogueSearchPayload, CatalogueSearchResult, DownloadSource } from "@types";
import { useAppSelector } from "@renderer/hooks";
import { useCatalogue } from "@renderer/hooks/use-catalogue";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import { PAGE_SIZE } from "../types";

export function useCatalogueSearch() {
  const requestSequenceRef = useRef(0);
  const hasResultsRef = useRef(false);
  const cataloguePageRef = useRef<HTMLDivElement>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const { downloadSources } = useCatalogue();
  const { filters, page } = useAppSelector((state) => state.catalogueSearch);
  const deferredTitleFilter = useDeferredValue(filters.title);

  const hideExplicitContent = useAppSelector(
    (state) => state.userPreferences.value?.hideExplicitContent
  );

  const effectiveFilters = useMemo(() => {
    return { ...filters, title: deferredTitleFilter };
  }, [filters, deferredTitleFilter]);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [results, setResults] = useState<CatalogueSearchResult[]>([]);
  const [itemsCount, setItemsCount] = useState(0);

  const debouncedSearch = useRef(
    debounce(
      async (
        filters: CatalogueSearchPayload,
        downloadSources: DownloadSource[],
        pageSize: number,
        offset: number,
        requestId: number
      ) => {
        const requestData: Record<string, any> = {
          ...filters,
          take: pageSize,
          skip: offset,
          downloadSourceIds: downloadSources.map(
            (downloadSource) => downloadSource.id
          ),
          showAdult: !hideExplicitContent,
        };

        try {
          const response = await window.electron.forgerApi.post<{
            edges: CatalogueSearchResult[];
            count: number;
          }>("/catalogue/search", {
            data: requestData,
            needsAuth: false,
          });

          if (requestId !== requestSequenceRef.current) return;

          const edges = response.edges;

          try {
            const pirateBatch = await window.electron.getGameDataBatch(
              edges.map((e: { shop: string; objectId: string }) => ({ shop: e.shop, objectId: e.objectId }))
            );

            if (pirateBatch && typeof pirateBatch === "object") {
              for (const edge of edges) {
                const key = `${edge.shop}:${edge.objectId}`;
                const pirate = pirateBatch[key];
                if (pirate && pirate.downloadSources?.length > 0) {
                  edge.downloadSources = [
                    ...new Set([...edge.downloadSources, ...pirate.downloadSources]),
                  ];
                }
              }
            }
          } catch {
            /* pirate data unavailable — noop */
          }

          setResults(edges);
          setItemsCount(response.count);
          setIsLoading(false);
        } finally {
          if (requestId === requestSequenceRef.current) {
            setIsFetching(false);
          }
        }
      },
      500
    )
  ).current;

  useEffect(() => {
    hasResultsRef.current = results.length > 0;
  }, [results.length]);

  useEffect(() => {
    const requestId = ++requestSequenceRef.current;
    setIsFetching(true);

    if (!hasResultsRef.current) {
      setIsLoading(true);
    }

    debouncedSearch(
      effectiveFilters,
      downloadSources,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
      requestId
    );

    return () => {
      debouncedSearch.cancel();
    };
  }, [effectiveFilters, downloadSources, page, debouncedSearch, refetchKey]);

  useEffect(() => {
    const onUnlock = () => setRefetchKey((k) => k + 1);
    window.addEventListener("supplemental-unlocked", onUnlock);
    return () => window.removeEventListener("supplemental-unlocked", onUnlock);
  }, []);

  return {
    isLoading,
    isFetching,
    results,
    itemsCount,
    cataloguePageRef,
  };
}
