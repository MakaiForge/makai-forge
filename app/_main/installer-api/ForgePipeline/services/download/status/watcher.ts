import type { Download, DownloadProgress, Game } from "@types";
import { downloadsStore, gamesStore } from "@main/store";
import { sendProgressUpdate } from "../completion/ui-update";
import { handleDownloadCompletion } from "../completion";
import { logger } from "@main/services/logger";

export async function watchDownloads(
  status: DownloadProgress | null,
  handleExtractionFn: (download: any, game: Game) => Promise<void>,
  processNextFn: () => Promise<void>
): Promise<void> {
  if (!status) return;

  const { gameId, progress } = status as any;
  const [download, game] = await Promise.all([
    downloadsStore.get(gameId),
    gamesStore.get(gameId),
  ]);

  if (!download || !game) return;

  if ((status as any).state === "removed") {
    await downloadsStore.put(gameId, {
      ...(download as Download),
      status: "removed",
      queued: false,
      shouldSeed: false,
    });
    sendProgressUpdate(1, { ...status, progress: 1 } as DownloadProgress, game);
    logger.log(`[Downloads] Torrent removed from qBittorrent for ${gameId}`);
    return;
  }

  sendProgressUpdate(progress, status, game);

  const isComplete =
    !status.isCheckingFiles &&
    !status.isDownloadingMetadata &&
    (progress === 1 || download.status === "complete");
  if (isComplete) {
    await handleDownloadCompletion(
      download,
      game,
      gameId,
      true,
      handleExtractionFn,
      processNextFn
    );
  }
}
