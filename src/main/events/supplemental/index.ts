import { registerEvent } from "../register-event";
import { getSupplementalData, getSupplementalMapSize } from "@main/services/supplemental-content";

// A conquista por Konami Code foi desativada — catálogo e downloads
// ficam sempre liberados (os handlers abaixo retornam unlocked: true).

registerEvent("supplemental:check", async (_event, _keys: number[]) => {
  return { unlocked: true };
});

registerEvent("supplemental:status", async () => {
  return { unlocked: true };
});

registerEvent("supplemental:getGameData", async (_event, shop: string, objectId: string) => {
  const data = getSupplementalData(shop, objectId);
  return data;
});

registerEvent("supplemental:getGameDataBatch", async (_event, entries: { shop: string; objectId: string }[]) => {
  const result: Map<string, { downloadSources: string[]; downloads: any[] }> = new Map();
  for (const { shop, objectId } of entries) {
    const data = getSupplementalData(shop, objectId);
    if (data) {
      const hasSources = data.downloadSources.length > 0;
      const hasDownloads = data.downloads.length > 0;
      if (hasSources || hasDownloads) {
        result.set(`${shop}:${objectId}`, data);
      }
    }
  }
  return Object.fromEntries(result);
});

registerEvent("supplemental:debug", async () => {
  return {
    unlockState: true,
    dbValue: true,
    mapSize: getSupplementalMapSize(),
    totalGames: 201767,
  };
});

export function resetSupplemental(): void {
  // no-op — a conquista por Konami Code foi desativada
}
