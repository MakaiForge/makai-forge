export interface LibtorrentPayload {
  progress: number;
  numPeers: number;
  numSeeds: number;
  downloadSpeed: number;
  bytesDownloaded: number;
  fileSize: number;
  folderName: string;
  gameId: string;
  status: string;
}

export enum LibtorrentStatus {
  Downloading = "downloading",
  Seeding = "seeding",
  Paused = "paused",
  CheckingFiles = "checking_files",
  DownloadingMetadata = "downloading_metadata",
}

export interface PauseDownloadPayload {
  action: "pause";
  game_id: string;
}

export interface ProcessPayload {
  pid: number;
  name: string;
  exe: string;
  cwd: string;
  environ?: Record<string, string>;
}
