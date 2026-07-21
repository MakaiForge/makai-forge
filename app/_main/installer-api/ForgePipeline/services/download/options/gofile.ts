import type { Download } from "@types";
import { GofileApi } from "@main/services/hosters";
import { Downloader } from "@shared";
import { parseGofileUri, buildDownloadOptions, resolveFilename } from "../url";
import type { DownloadOptions } from "../url";

export async function getGofileDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  if (download.downloader !== Downloader.Gofile) {
    throw new Error("Invalid downloader for Gofile options");
  }
  const { id, password } = parseGofileUri(download.uri);
  if (!id) {
    throw new Error("Invalid gofile URL");
  }

  const downloadLink = await GofileApi.getDownloadLink(id, password);
  await GofileApi.checkDownloadUrl(downloadLink);
  const token = await GofileApi.authorize();

  const filename = resolveFilename(
    resumingFilename,
    download.uri,
    downloadLink
  );
  return buildDownloadOptions(downloadLink, download.downloadPath, filename, {
    Cookie: `accountToken=${token}`,
  });
}
