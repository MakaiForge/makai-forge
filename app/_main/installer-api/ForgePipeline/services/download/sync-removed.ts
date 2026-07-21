import type { TorrentBackend } from "./torrent-backend";
import { downloadsStore, gamesStore } from "@main/store";
import { WindowManager } from "@main/services/window-manager";
import { logger } from "@main/services/logger";

const removedCache = new Set<string>();

export async function syncRemovedDownloads(
  torrentBackend: TorrentBackend
): Promise<void> {
  const allTorrents = await torrentBackend.getAllTorrents().catch(() => []);
  const qbHashes = new Set(allTorrents.map((t: any) => t.hash));

  const toRemove: string[] = [];

  for await (const [key, value] of downloadsStore.iterator()) {
    const qbHash = (value as any)?.qbHash;
    if (
      qbHash &&
      !qbHashes.has(qbHash) &&
      value.status !== "removed" &&
      !removedCache.has(key)
    ) {
      toRemove.push(key);
    }
  }

  if (toRemove.length === 0) return;

  const keys = toRemove.join(", ");
  logger.log(`[DownloadManager] Torrents removed from qBittorrent: ${keys}`);

  for (const key of toRemove) {
    removedCache.add(key);
    const game = await gamesStore.get(key).catch(() => null);
    const value = (await downloadsStore.get(key).catch(() => null)) as any;
    if (value) {
      const updated = { ...(value as any) };
      delete updated.qbHash;
      updated.status = "removed";
      updated.queued = false;
      updated.shouldSeed = false;
      await downloadsStore.put(key, updated);
    }
    if (game) {
      WindowManager.mainWindow?.webContents.send("on-download-progress", {
        gameId: key,
        progress: 1,
        game,
        downloadSpeed: 0,
        timeRemaining: -1,
        numPeers: 0,
        numSeeds: 0,
        isDownloadingMetadata: false,
        isCheckingFiles: false,
      });
    }
  }
}
