import { PythonRPC } from "@main/services/python-rpc";
import { resumeSeeding } from "./seed";
import type { Download } from "@types";
import { logger } from "@main/services/logger";

export async function startDownloadRPC(
  startDownload: (download: Download) => Promise<void>,
  applySpeedLimit: () => Promise<void>,
  download?: Download,
  downloadsToSeed?: Download[]
): Promise<void> {
  try {
    await PythonRPC.spawn();
  } catch (error) {
    logger.error("[DownloadManager] Failed to spawn RPC:", error);
    return;
  }

  if (downloadsToSeed?.length) {
    for (const seedDownload of downloadsToSeed) {
      await resumeSeeding(seedDownload).catch((error) => {
        logger.error("[DownloadManager] Failed to resume seeding", error);
      });
    }
  }

  if (download) {
    await startDownload(download).catch((error) => {
      logger.error("[DownloadManager] Failed to resume download", error);
    });
  }

  await applySpeedLimit();
}
