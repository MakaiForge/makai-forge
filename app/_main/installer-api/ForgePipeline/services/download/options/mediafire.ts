import type { Download } from "@types";
import { MediafireApi } from "@main/services/hosters";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getMediafireDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await MediafireApi.getDownloadUrl(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
