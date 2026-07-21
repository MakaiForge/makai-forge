import type { Download } from "@types";
import { RootzApi } from "@main/services/hosters";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getRootzDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await RootzApi.getDownloadUrl(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
