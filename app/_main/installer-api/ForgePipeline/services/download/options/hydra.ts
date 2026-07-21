import type { Download } from "@types";
import { HydraDebridClient } from "../hydra-debrid";
import { DownloadError } from "@shared";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getHydraDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await HydraDebridClient.getDownloadUrl(download.uri);
  if (!downloadUrl) throw new Error(DownloadError.NotCachedOnHydra);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
