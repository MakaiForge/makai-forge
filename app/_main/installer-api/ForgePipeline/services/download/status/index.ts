import { Downloader } from "@shared";
import type { Download, DownloadProgress } from "@types";
import type { JsHttpDownloader } from "../js-http-downloader";
import type { TorrentBackend } from "../torrent-backend";
import { getDownloadStatusFromJs } from "./js-status";
import { getDownloadStatusFromRpc } from "./rpc-status";
import { watchDownloads } from "./watcher";

export async function getDownloadStatus(
  downloadingGameId: string | null,
  usingJsDownloader: boolean,
  download: Download | null,
  jsDownloader: JsHttpDownloader | null,
  isPreparingDownload: boolean,
  torrentBackend: TorrentBackend
): Promise<DownloadProgress | null> {
  if (usingJsDownloader) {
    return downloadingGameId
      ? getDownloadStatusFromJs(
          downloadingGameId,
          jsDownloader,
          isPreparingDownload
        )
      : null;
  }
  if (!downloadingGameId) return null;
  if (download?.downloader === Downloader.Torrent) {
    return (await torrentBackend.getStatus(
      downloadingGameId
    )) as DownloadProgress | null;
  }
  return getDownloadStatusFromRpc(downloadingGameId);
}

export { watchDownloads };
