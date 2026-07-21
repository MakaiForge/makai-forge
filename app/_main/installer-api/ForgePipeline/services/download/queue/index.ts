import { downloadsStore } from "@main/store";
import { orderBy } from "lodash-es";

export async function processNextQueuedDownload(
  setDownloadingGameId: (id: string | null) => void,
  setUsingJsDownloader: (value: boolean) => void,
  setJsDownloader: (downloader: any | null) => void,
  resumeDownloadFn: (download: any) => Promise<void>
): Promise<void> {
  const downloads = await downloadsStore
    .values()
    .all()
    .then((games) =>
      orderBy(
        games.filter((game) => game.status === "paused" && game.queued),
        ["timestamp"],
        ["desc"]
      )
    );

  const [nextItemOnQueue] = downloads;

  if (nextItemOnQueue) {
    await resumeDownloadFn(nextItemOnQueue);
  } else {
    setDownloadingGameId(null);
    setUsingJsDownloader(false);
    setJsDownloader(null);
  }
}
