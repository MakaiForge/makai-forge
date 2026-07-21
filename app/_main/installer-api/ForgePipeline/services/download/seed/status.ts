import { PythonRPC } from "@main/services/python-rpc";
import { downloadsStore } from "@main/store";
import { WindowManager } from "@main/services/window-manager";
import { getDirSize } from "../helpers";
import type { LibtorrentPayload } from "../types";
import path from "node:path";
import { pauseSeeding } from "./pause";
import { logger } from "@main/services/logger";

export async function getSeedStatus(): Promise<void> {
  let seedStatus: LibtorrentPayload[] = [];

  if (PythonRPC.isSpawnDisabled()) {
    return;
  }

  try {
    seedStatus = await PythonRPC.rpc
      .call<LibtorrentPayload[] | []>("seed_status")
      .then((res) => res.data);
  } catch (error) {
    logger.error("[DownloadManager] RPC seed status poll failed", error);
    WindowManager.mainWindow?.webContents.send("on-seeding-status", []);
    return;
  }

  if (!seedStatus.length) {
    WindowManager.mainWindow?.webContents.send("on-seeding-status", []);
    return;
  }

  logger.log(seedStatus);

  for (const status of seedStatus) {
    const download = await downloadsStore.get(status.gameId);
    if (!download) continue;

    const totalSize = await getDirSize(
      path.join(download.downloadPath, status.folderName)
    );

    if (totalSize < status.fileSize) {
      await pauseSeeding(status.gameId);

      await downloadsStore.put(status.gameId, {
        ...download,
        status: "paused",
        shouldSeed: false,
        progress:
          status.fileSize > 0
            ? Math.min(totalSize / status.fileSize, 1)
            : download.progress,
      });

      WindowManager.mainWindow?.webContents.send("on-hard-delete");
    }
  }

  WindowManager.mainWindow?.webContents.send("on-seeding-status", seedStatus);
}
