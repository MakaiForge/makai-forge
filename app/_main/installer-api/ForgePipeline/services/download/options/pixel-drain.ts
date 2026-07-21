import type { Download } from "@types";
import { PixelDrainApi } from "@main/services/hosters";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getPixelDrainDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await PixelDrainApi.unlock(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
