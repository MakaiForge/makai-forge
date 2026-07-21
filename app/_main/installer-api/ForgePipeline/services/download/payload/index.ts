import type { Download } from "@types";
import { storeKeys } from "@main/store";
import { Downloader } from "@shared";
import { getHttpPayload } from "./http";
import { getTorrentPayload } from "./torrent";

export async function getDownloadPayload(
  download: Download
): Promise<ReturnType<typeof getHttpPayload>> {
  const downloadId = storeKeys.game(download.shop, download.objectId);

  if (download.downloader === Downloader.Torrent) {
    return getTorrentPayload(download, downloadId) as any;
  }

  return getHttpPayload(download, downloadId);
}
