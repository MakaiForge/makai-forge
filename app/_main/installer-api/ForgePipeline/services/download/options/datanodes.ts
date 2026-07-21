import type { Download } from "@types";
import { DatanodesApi } from "@main/services/hosters";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getDatanodesDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await DatanodesApi.getDownloadUrl(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
