import { db, storeKeys } from "@main/store";
import type { UserPreferences } from "@types";
import { PythonRPC } from "@main/services/python-rpc";
import { logger } from "@main/services/logger";
import { normalizeDownloadSpeedLimit } from "./normalize";

export async function getPersistedDownloadSpeedLimit(): Promise<number | null> {
  try {
    const userPreferences = await db.get<string, UserPreferences>(
      storeKeys.userPreferences,
      { valueEncoding: "json" }
    );
    return normalizeDownloadSpeedLimit(
      userPreferences?.maxDownloadSpeedBytesPerSecond
    );
  } catch {
    return null;
  }
}

export async function applyDownloadSpeedLimit(
  maxDownloadSpeedBytesPerSecond: number | null,
  jsDownloader: {
    setMaxDownloadSpeedBytesPerSecond: (limit: number | null) => void;
  } | null
): Promise<void> {
  jsDownloader?.setMaxDownloadSpeedBytesPerSecond(
    maxDownloadSpeedBytesPerSecond
  );

  if (PythonRPC.isSpawnDisabled()) {
    return;
  }

  await PythonRPC.rpc
    .call("action", {
      action: "set_download_limit",
      max_download_speed_bytes_per_second: maxDownloadSpeedBytesPerSecond,
    })
    .catch((error) => {
      logger.error(
        "[DownloadManager] Failed to update RPC download limit:",
        error
      );
    });
}

export { normalizeDownloadSpeedLimit };
