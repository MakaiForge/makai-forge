import type { Download } from "@types";
import { FuckingFastApi } from "@main/services/hosters";
import { logger } from "@main/services/logger";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getFuckingFastDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  logger.log(
    `[DownloadManager] Processing FuckingFast download for URI: ${download.uri}`
  );
  const directUrl = await FuckingFastApi.getDirectLink(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, directUrl);
  return buildDownloadOptions(directUrl, download.downloadPath, filename);
}
