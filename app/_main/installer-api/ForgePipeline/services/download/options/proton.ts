import type { Download } from "@types";
import { ProtonDebridClient } from "../proton-debrid";
import { DownloadError } from "@shared";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getProtonDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await ProtonDebridClient.getDownloadUrl(download.uri);
  if (!downloadUrl) throw new Error(DownloadError.NotCached);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
