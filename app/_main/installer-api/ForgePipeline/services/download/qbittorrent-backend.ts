import { QBittorrentClient } from "./qbittorrent-client";
import { TorrentBackend, TorrentStatus, TorrentInfo } from "./torrent-backend";
import { logger } from "@main/services/logger";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import type { Download } from "@types";
import { calculateETA } from "./helpers";

export { gamesStore, storeKeys };

export class QBittorrentBackend implements TorrentBackend {
  private client: QBittorrentClient;
  private hashCache: Map<string, string> = new Map();

  constructor() {
    this.client = new QBittorrentClient();
  }

  async startDownload(
    gameId: string,
    magnet: string,
    savePath: string
  ): Promise<void> {
    logger.log(`[QBittorrentBackend] Starting download: ${gameId}`);

    const match = magnet.match(/urn:btih:([A-Fa-f0-9]{40})/i);
    const hash = match ? match[1].toLowerCase() : null;

    if (!hash) {
      logger.error(`[QBittorrentBackend] Could not extract hash from magnet`);
      return;
    }

    this.hashCache.set(gameId, hash);

    const download = await downloadsStore.get(gameId).catch(() => null);
    if (download) {
      await downloadsStore.put(gameId, {
        ...download,
        qbHash: hash,
      } as Download);
    }

    await this.client.addMagnet(magnet, savePath);
    logger.log(`[QBittorrentBackend] Torrent added - Hash: ${hash}`);
  }

  async pause(gameId: string): Promise<void> {
    const hash = await this.getHash(gameId);
    if (hash) {
      await this.client.stop(hash);
    }
  }

  async resume(gameId: string): Promise<void> {
    const hash = await this.getHash(gameId);
    if (hash) {
      await this.client.start(hash);
    }
  }

  async cancel(gameId: string): Promise<void> {
    const hash = await this.getHash(gameId);
    if (hash) {
      await this.client.delete(hash, false);
      this.hashCache.delete(gameId);
    }
  }

  async delete(gameId: string, deleteFiles = false): Promise<void> {
    const hash = await this.getHash(gameId);
    if (hash) {
      await this.client.delete(hash, deleteFiles);
      this.hashCache.delete(gameId);
    }
  }

  async getAllTorrents(): Promise<TorrentInfo[]> {
    const torrents = await this.client.getTorrents();
    return torrents.map((t: any) => ({
      hash: t.hash,
      name: t.name,
      size: t.size,
      progress: t.progress,
      dlspeed: t.dlspeed,
      upspeed: t.upspeed,
      num_leechs: t.num_leechs,
      num_seeds: t.num_seeds,
      state: t.state,
    }));
  }

  async getStatus(gameId: string): Promise<TorrentStatus | null> {
    try {
      const hash = await this.getHash(gameId);
      const torrents = await this.getAllTorrents();

      const torrent = hash ? torrents.find((t) => t.hash === hash) : null;

      if (!torrent) {
        const stored = (await downloadsStore
          .get(gameId)
          .catch(() => null)) as any;
        if (stored?.qbHash && stored.status !== "removed") {
          return {
            gameId,
            progress: 1,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            numSeeds: 0,
            bytesDownloaded: 0,
            fileSize: 0,
            folderName: "",
            status: 0,
            isCheckingFiles: false,
            isDownloadingMetadata: false,
            state: "removed",
            timeRemaining: -1,
          } as any;
        }
        if (stored?.status === "removed") {
          this.hashCache.delete(gameId);
        }
        return null;
      }

      const state = (torrent.state || "").toLowerCase().trim();
      const statusCode = this.mapStateToLibtorrentStatus(state);
      const bytesDownloaded = Math.floor(
        (torrent.size || 0) * (torrent.progress || 0)
      );
      const fileSize = torrent.size || 0;

      const download = await downloadsStore.get(gameId).catch(() => null);

      logger.log(
        `[QBittorrentBackend] Status for ${gameId}: ${torrent.state} → statusCode=${statusCode} | progress=${(torrent.progress * 100).toFixed(1)}%`
      );

      return {
        gameId,
        progress: torrent.progress || 0,
        downloadSpeed: torrent.dlspeed || 0,
        uploadSpeed: torrent.upspeed || 0,
        numPeers: torrent.num_leechs || 0,
        numSeeds: torrent.num_seeds || 0,
        bytesDownloaded,
        fileSize,
        folderName: torrent.name || "",
        status: statusCode,
        isCheckingFiles: statusCode === 1,
        isDownloadingMetadata: statusCode === 2,
        state: torrent.state,
        download: download || undefined,
        timeRemaining: calculateETA(
          fileSize,
          bytesDownloaded,
          torrent.dlspeed || 0
        ),
      } as TorrentStatus & {
        download: Download | undefined;
        timeRemaining: number;
      };
    } catch (err) {
      logger.error("[QBittorrentBackend] getStatus error:", err);
      return null;
    }
  }

  private mapStateToLibtorrentStatus(state: string): number {
    if (["metadl", "forcedmetadl"].includes(state)) return 2;
    if (
      ["checkingdl", "checkingup", "checkingresumedata", "allocating"].includes(
        state
      )
    )
      return 1;
    if (["downloading", "forceddl", "stalleddl"].includes(state)) return 3;
    if (["uploading", "forcedup", "stalledup"].includes(state)) return 5;
    if (["completed", "pausedup"].includes(state)) return 4;
    return 0;
  }

  private async getHash(gameId: string): Promise<string | null> {
    if (this.hashCache.has(gameId)) {
      return this.hashCache.get(gameId)!;
    }

    const download = await downloadsStore.get(gameId).catch(() => null);
    if ((download as any)?.qbHash) {
      const hash = (download as any).qbHash;
      this.hashCache.set(gameId, hash);
      return hash;
    }

    return null;
  }
}
