import { Downloader } from "@shared";
import { WindowManager } from "@main/services/window-manager";
import type { Download, Game } from "@types";
import { JsHttpDownloader } from "./js-http-downloader";
import { QBittorrentBackend } from "./qbittorrent-backend";
import type { TorrentBackend } from "./torrent-backend";
import { db, downloadsStore, gamesStore, storeKeys } from "@main/store";
import { logger } from "@main/services/logger";
import { startDownloadRPC } from "./download-rpc";
import { syncRemovedDownloads } from "./sync-removed";

export { db };

import { logResolvedUrl } from "./url";
import { getJsDownloadOptions } from "./options";
import { getDownloadPayload } from "./payload";
import { getDownloadStatus, watchDownloads } from "./status";
import {
  getPersistedDownloadSpeedLimit,
  applyDownloadSpeedLimit,
  normalizeDownloadSpeedLimit,
} from "./speed-limit";
import {
  handleDownloadCompletion,
  handleExtraction,
  updateDownloadStatus,
} from "./completion";
import { resumeSeeding, pauseSeeding, getSeedStatus } from "./download-seeding";
import { processNextQueuedDownload } from "./queue";

export class DownloadManager {
  private static downloadingGameId: string | null = null;
  private static jsDownloader: JsHttpDownloader | null = null;
  private static usingJsDownloader = false;
  private static isPreparingDownload = false;
  private static maxDownloadSpeedBytesPerSecond: number | null = null;
  private static torrentBackend: TorrentBackend = new QBittorrentBackend();

  public static hasActiveDownload() {
    return this.downloadingGameId !== null;
  }

  private static isHttpDownloader(downloader: Downloader): boolean {
    return downloader !== Downloader.Torrent;
  }

  public static async applyDownloadSpeedLimit(
    value?: number | null
  ): Promise<void> {
    const normalizedLimit =
      value === undefined
        ? await getPersistedDownloadSpeedLimit()
        : normalizeDownloadSpeedLimit(value);
    this.maxDownloadSpeedBytesPerSecond = normalizedLimit;
    await applyDownloadSpeedLimit(normalizedLimit, this.jsDownloader);
  }

  public static async startRPC(
    download?: Download,
    downloadsToSeed?: Download[]
  ) {
    await startDownloadRPC(
      (d) => this.startDownload(d),
      () => this.applyDownloadSpeedLimit(),
      download,
      downloadsToSeed
    );
  }

  public static async watchDownloads() {
    const status = await getDownloadStatus(
      this.downloadingGameId,
      this.usingJsDownloader,
      this.downloadingGameId
        ? ((await downloadsStore.get(this.downloadingGameId)) ?? null)
        : null,
      this.jsDownloader,
      this.isPreparingDownload,
      this.torrentBackend
    );
    if (!status) return;

    const { gameId } = status;
    const [download, game] = await Promise.all([
      downloadsStore.get(gameId),
      gamesStore.get(gameId),
    ]);

    if (!download || !game) return;

    await watchDownloads(status, handleExtraction, () =>
      this.processNextQueuedDownloadWrapper()
    );

    await syncRemovedDownloads(this.torrentBackend);
  }

  public static async getSeedStatus() {
    await getSeedStatus();
  }

  static async pauseDownload(downloadKey = this.downloadingGameId) {
    if (this.usingJsDownloader && this.jsDownloader) {
      logger.log("[DownloadManager] Pausing JS download");
      this.jsDownloader.pauseDownload();
    } else if (downloadKey) {
      await this.torrentBackend.pause(downloadKey).catch(() => {});
    }
    if (downloadKey === this.downloadingGameId) {
      WindowManager.mainWindow?.setProgressBar(-1);
      this.downloadingGameId = null;
    }
  }

  static async resumeDownload(download: Download) {
    if (download.downloader === Downloader.Torrent) {
      const downloadId = storeKeys.game(download.shop, download.objectId);
      this.downloadingGameId = downloadId;
      this.isPreparingDownload = false;
      this.usingJsDownloader = false;

      const stored = await downloadsStore.get(downloadId).catch(() => null);
      const qbHash = (stored as any)?.qbHash;

      if (qbHash) {
        await this.torrentBackend.resume(downloadId);
        logger.log(`[DownloadManager] Torrent resumed via API: ${qbHash}`);
        return;
      }
    }

    return this.startDownload(download);
  }

  static async cancelDownload(downloadKey = this.downloadingGameId) {
    const isActiveDownload = downloadKey === this.downloadingGameId;

    if (isActiveDownload) {
      if (this.usingJsDownloader && this.jsDownloader) {
        logger.log("[DownloadManager] Cancelling JS download");
        this.jsDownloader.cancelDownload();
        this.jsDownloader = null;
        this.usingJsDownloader = false;
      } else if (downloadKey) {
        await this.torrentBackend
          .cancel(downloadKey)
          .catch((err) => logger.error("Failed to cancel game download", err));
      }
      WindowManager.mainWindow?.setProgressBar(-1);
      WindowManager.mainWindow?.webContents.send("on-download-progress", null);
      this.downloadingGameId = null;
      this.isPreparingDownload = false;
      this.usingJsDownloader = false;
    } else if (downloadKey) {
      await this.torrentBackend
        .cancel(downloadKey)
        .catch((err) => logger.error("Failed to cancel game download", err));
    }
  }

  static async resumeSeeding(download: Download) {
    await resumeSeeding(download);
  }

  static async pauseSeeding(downloadKey: string) {
    await pauseSeeding(downloadKey);
  }

  static async validateDownloadUrl(download: Download): Promise<void> {
    if (this.isHttpDownloader(download.downloader)) {
      const options = await getJsDownloadOptions(download);
      if (!options) throw new Error("Failed to validate download URL");
    }
  }

  static async getPayload(download: Download) {
    return getDownloadPayload(download);
  }

  static async completeDownload(
    download: Download,
    game: Game,
    gameId: string,
    shouldSeed: boolean
  ) {
    return handleDownloadCompletion(
      download,
      game,
      gameId,
      shouldSeed,
      handleExtraction,
      () => this.processNextQueuedDownloadWrapper()
    );
  }

  static async updateStatus(
    download: Download,
    gameId: string,
    shouldSeed?: boolean
  ) {
    return updateDownloadStatus(download, gameId, shouldSeed);
  }

  private static async processNextQueuedDownloadWrapper() {
    await processNextQueuedDownload(
      (id) => {
        this.downloadingGameId = id;
      },
      (value) => {
        this.usingJsDownloader = value;
      },
      (downloader) => {
        this.jsDownloader = downloader;
      },
      (download) => this.resumeDownload(download)
    );
  }

  static async startDownload(download: Download) {
    const isHttp = this.isHttpDownloader(download.downloader);
    const downloadId = storeKeys.game(download.shop, download.objectId);

    if (isHttp) {
      logger.log("[DownloadManager] Using JS HTTP downloader");
      this.downloadingGameId = downloadId;
      this.isPreparingDownload = true;
      this.usingJsDownloader = true;

      try {
        const options = await getJsDownloadOptions(download);
        if (!options) {
          this.isPreparingDownload = false;
          this.usingJsDownloader = false;
          this.downloadingGameId = null;
          throw new Error("Failed to get download options for JS downloader");
        }

        this.jsDownloader = new JsHttpDownloader();
        this.jsDownloader.setMaxDownloadSpeedBytesPerSecond(
          this.maxDownloadSpeedBytesPerSecond
        );
        this.isPreparingDownload = false;
        logResolvedUrl(options.url);
        this.jsDownloader.startDownload(options).catch((err) => {
          logger.error("[DownloadManager] JS download error:", err);
          this.usingJsDownloader = false;
          this.jsDownloader = null;
        });
      } catch (err) {
        this.isPreparingDownload = false;
        this.usingJsDownloader = false;
        this.downloadingGameId = null;
        throw err;
      }
    } else {
      logger.log("[DownloadManager] Using QBittorrent Backend for torrent");
      this.downloadingGameId = downloadId;
      this.isPreparingDownload = true;
      this.usingJsDownloader = false;

      try {
        await this.torrentBackend.startDownload(
          downloadId,
          download.uri!,
          download.downloadPath
        );
        this.isPreparingDownload = false;
        logger.log(
          `[DownloadManager] Torrent download started successfully: ${downloadId}`
        );
      } catch (err) {
        this.isPreparingDownload = false;
        this.downloadingGameId = null;
        logger.error(
          "[DownloadManager] Failed to start torrent download:",
          err
        );
        throw err;
      }
    }
  }
}

export { ProtonDebridClient } from "./proton-debrid";

export { getDownloadPayload } from "./payload";
export { handleDownloadCompletion, updateDownloadStatus } from "./completion";
export { getPersistedDownloadSpeedLimit } from "./speed-limit";
export { normalizeDownloadSpeedLimit } from "./speed-limit/normalize";
