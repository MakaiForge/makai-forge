import type { Download } from "@types";
import { ProtonForgeDebridClient } from "../protonforge-debrid";
import { DownloadError } from "@shared";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getProtonForgeDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  const downloadUrl = await ProtonForgeDebridClient.getDownloadUrl(
    download.uri
  );
  if (!downloadUrl) throw new Error(DownloadError.NotCachedOnProtonForge);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
