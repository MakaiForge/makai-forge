import path from "node:path";
import type { Download } from "@types";
import { Downloader } from "@shared";
import type { DownloadOptions } from "../url";
import { getGofileDownloadOptions } from "./gofile";
import { getPixelDrainDownloadOptions } from "./pixel-drain";
import { getDatanodesDownloadOptions } from "./datanodes";
import { getBuzzheavierDownloadOptions } from "./buzzheavier";
import { getFuckingFastDownloadOptions } from "./fucking-fast";
import { getMediafireDownloadOptions } from "./mediafire";
import { getProtonDownloadOptions } from "./proton";
import { getVikingFileDownloadOptions } from "./viking-file";
import { getRootzDownloadOptions } from "./rootz";

export async function getJsDownloadOptions(
  download: Download
): Promise<DownloadOptions | null> {
  const resumingFilename = download.folderName || undefined;

  switch (download.downloader) {
    case Downloader.Gofile:
      return getGofileDownloadOptions(download, resumingFilename);
    case Downloader.PixelDrain:
      return getPixelDrainDownloadOptions(download, resumingFilename);
    case Downloader.Datanodes:
      return getDatanodesDownloadOptions(download, resumingFilename);
    case Downloader.Buzzheavier:
      return getBuzzheavierDownloadOptions(download, resumingFilename);
    case Downloader.FuckingFast:
      return getFuckingFastDownloadOptions(download, resumingFilename);
    case Downloader.Mediafire:
      return getMediafireDownloadOptions(download, resumingFilename);
    case Downloader.Nimbus:
      return getProtonDownloadOptions(download, resumingFilename);
    case Downloader.VikingFile:
      return getVikingFileDownloadOptions(download, resumingFilename);
    case Downloader.Rootz:
      return getRootzDownloadOptions(download, resumingFilename);
    case Downloader.Direct:
      return {
        url: download.uri!,
        savePath: path.join(download.downloadPath, download.folderName || ""),
        filename: undefined,
      };
    default:
      return null;
  }
}
