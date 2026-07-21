import type { Download } from "@types";

export type { Download };

export interface TorrentBackend {
  startDownload(
    gameId: string,
    magnet: string,
    savePath: string,
    options?: {
      fileIndices?: number[];
      metadataTimeoutMs?: number;
    }
  ): Promise<void>;
  pause(gameId: string): Promise<void>;
  resume(gameId: string): Promise<void>;
  cancel(gameId: string): Promise<void>;
  delete(gameId: string, deleteFiles?: boolean): Promise<void>;
  getStatus(gameId: string): Promise<TorrentStatus | null>;
  getAllTorrents(): Promise<TorrentInfo[]>;
}

export interface TorrentInfo {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  num_leechs: number;
  num_seeds: number;
  state: string;
}

export interface TorrentStatus {
  gameId: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  numSeeds: number;
  bytesDownloaded: number;
  fileSize: number;
  folderName: string;
  status: number;
  isCheckingFiles: boolean;
  isDownloadingMetadata: boolean;
  state?: string;
}
