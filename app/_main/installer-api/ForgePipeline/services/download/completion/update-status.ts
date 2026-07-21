import type { Download } from "@types";
import { Downloader } from "@shared";
import { downloadsStore } from "@main/store";

export async function updateDownloadStatus(
  download: Download,
  gameId: string,
  shouldSeed?: boolean
): Promise<boolean> {
  const shouldExtract = download.automaticallyExtract;
  const isSelectiveTorrent =
    download.downloader === Downloader.Torrent &&
    Array.isArray(download.fileIndices) &&
    download.fileIndices.length > 0;

  if (
    shouldSeed &&
    download.downloader === Downloader.Torrent &&
    !isSelectiveTorrent
  ) {
    await downloadsStore.put(gameId, {
      ...download,
      status: "seeding",
      shouldSeed: true,
      queued: false,
      extracting: shouldExtract,
    });
    return true;
  } else {
    await downloadsStore.put(gameId, {
      ...download,
      status: "complete",
      shouldSeed: false,
      queued: false,
      extracting: shouldExtract,
    });
    return false;
  }
}
