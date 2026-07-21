import type { Download } from "@types";
import { VikingFileApi } from "@main/services/hosters";
import { logger } from "@main/services/logger";
import { resolveFilename, buildDownloadOptions } from "../url";
import type { DownloadOptions } from "../url";

export async function getVikingFileDownloadOptions(
  download: Download,
  resumingFilename?: string
): Promise<DownloadOptions> {
  logger.log(
    `[DownloadManager] Processing VikingFile download for URI: ${download.uri}`
  );
  const downloadUrl = await VikingFileApi.getDownloadUrl(download.uri);
  const filename = resolveFilename(resumingFilename, download.uri, downloadUrl);
  return buildDownloadOptions(downloadUrl, download.downloadPath, filename);
}
