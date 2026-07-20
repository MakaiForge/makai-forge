import { useMemo } from "react";
import { useAppSelector, useLibrary } from "@renderer/hooks";
import { useDownload } from "@provision/ForgePipeline/ui/use-download";
import { orderBy } from "lodash-es";
import type { LibraryGame } from "@types";

export function useDownloadsLayout() {
  const { library } = useLibrary();
  const extraction = useAppSelector((state) => state.download.extraction);
  const { lastPacket } = useDownload();

  const libraryGroup: Record<string, LibraryGame[]> = useMemo(() => {
    const initialValue: Record<string, LibraryGame[]> = {
      downloading: [],
      queued: [],
      complete: [],
    };

    const result = orderBy(
      library,
      (game) => game.download?.timestamp,
      "desc"
    ).reduce((prev, next) => {
      if (!next.download) return prev;

      if (next.download.status === "removed") return prev;

      const isExtracting =
        next.download.extracting || extraction?.visibleId === next.id;
      if (lastPacket?.gameId === next.id || isExtracting)
        return { ...prev, downloading: [...prev.downloading, next] };

      const isQueuedDownload =
        next.download.queued &&
        next.download.status !== "complete" &&
        next.download.status !== "seeding";

      if (
        isQueuedDownload ||
        next.download?.status === "paused" ||
        next.download?.status === "error"
      )
        return { ...prev, queued: [...prev.queued, next] };

      return { ...prev, complete: [...prev.complete, next] };
    }, initialValue);

    const queued = orderBy(result.queued, (game) => game.download?.timestamp, [
      "desc",
    ]);

    const complete = orderBy(result.complete, (game) =>
      game.download?.progress === 1 ? 0 : 1
    );

    return {
      ...result,
      queued,
      complete,
    };
  }, [library, lastPacket?.gameId, extraction?.visibleId]);

  const queuedGameIds = useMemo(
    () => libraryGroup.queued.map((game) => game.id),
    [libraryGroup.queued]
  );

  const hasItemsInLibrary = useMemo(() => {
    return Object.values(libraryGroup).some((group) => group.length > 0);
  }, [libraryGroup]);

  return { libraryGroup, queuedGameIds, hasItemsInLibrary };
}
