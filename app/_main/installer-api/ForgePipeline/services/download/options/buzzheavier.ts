import type { Download } from "@types";
import { BuzzheavierApi } from "@main/services/hosters";
import { logger } from "@main/services/logger";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getBuzzheavierDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  logger.log(
    `[DownloadManager] Processing Buzzheavier download for URI: ${download.uri}`
  );
  const directUrl = await BuzzheavierApi.getDirectLink(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, directUrl);
  return buildDownloadOptions(directUrl, download.downloadPath, filename);
}
