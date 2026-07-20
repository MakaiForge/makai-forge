import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector, useDownload, useLibrary, useDate } from "@renderer/hooks";
import { formatBytes, formatBytesToMbps } from "@shared";
import { addMilliseconds } from "date-fns";
import type { GameShop, LibraryGame, SeedingStatus } from "@types";
import { average } from "color.js";
import { pickChartColor } from "../utils/color-utils";
import { getGameActions } from "../utils/game-actions";

export function useDownloadsGroup(
  library: LibraryGame[],
  title: string,
  openDeleteGameModal: (shop: GameShop, objectId: string) => void,
  seedingStatus: SeedingStatus[],
  queuedGameIds: string[]
) {
  const { t } = useTranslation("downloads");

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const extraction = useAppSelector((state) => state.download.extraction);

  const { updateLibrary } = useLibrary();

  const {
    lastPacket,
    pauseDownload: pauseDownloadOriginal,
    resumeDownload: resumeDownloadOriginal,
    cancelDownload,
    isGameDeleting,
    pauseSeeding,
    resumeSeeding,
  } = useDownload();

  const [dominantColors, setDominantColors] = useState<Record<string, string>>({});
  const [optimisticallyResumed, setOptimisticallyResumed] = useState<
    Record<string, boolean>
  >({});
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [gameToCancelShop, setGameToCancelShop] = useState<GameShop | null>(null);
  const [gameToCancelObjectId, setGameToCancelObjectId] = useState<string | null>(null);
  const [gameActionTypes, setGameActionTypes] = useState<
    Record<string, "install" | "open-folder">
  >({});

  const resumeDownload = useCallback(
    async (shop: GameShop, objectId: string) => {
      const gameId = `${shop}:${objectId}`;

      setOptimisticallyResumed((prev) => ({ ...prev, [gameId]: true }));

      try {
        await resumeDownloadOriginal(shop, objectId);
      } catch (error) {
        setOptimisticallyResumed((prev) => {
          const next = { ...prev };
          delete next[gameId];
          return next;
        });
        throw error;
      }
    },
    [resumeDownloadOriginal]
  );

  const pauseDownload = useCallback(
    async (shop: GameShop, objectId: string) => {
      const gameId = `${shop}:${objectId}`;

      setOptimisticallyResumed((prev) => {
        const next = { ...prev };
        delete next[gameId];
        return next;
      });

      await pauseDownloadOriginal(shop, objectId);
    },
    [pauseDownloadOriginal]
  );

  const speedHistory = useAppSelector((state) => state.download.speedHistory);
  const peakSpeeds = useAppSelector((state) => state.download.peakSpeeds);

  const extractDominantColor = useCallback(
    async (imageUrl: string, gameId: string) => {
      if (dominantColors[gameId]) return;

      try {
        const color = await average(imageUrl, { amount: 1, format: "hex" });
        const colorString =
          typeof color === "string" ? color : color.toString();
        setDominantColors((prev) => ({ ...prev, [gameId]: colorString }));
      } catch (error) {
        console.error("Failed to extract dominant color:", error);
      }
    },
    [dominantColors]
  );

  useEffect(() => {
    if (lastPacket?.gameId) {
      const gameId = lastPacket.gameId;
      setOptimisticallyResumed((prev) => {
        const next = { ...prev };
        delete next[gameId];
        return next;
      });
    }
  }, [lastPacket?.gameId]);

  useEffect(() => {
    setOptimisticallyResumed((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const gameId in next) {
        if (next[gameId]) {
          const game = library.find((g) => g.id === gameId);
          if (
            !game ||
            game.download?.status !== "active" ||
            lastPacket?.gameId === gameId
          ) {
            delete next[gameId];
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [library, lastPacket?.gameId]);

  useEffect(() => {
    if (library.length > 0 && title === t("download_in_progress")) {
      const game = library[0];
      const heroImageUrl =
        game.libraryHeroImageUrl || game.libraryImageUrl || "";
      if (heroImageUrl && game.id) {
        extractDominantColor(heroImageUrl, game.id);
      }
    }
  }, [library, title, t, extractDominantColor]);

  const isGameSeeding = (game: LibraryGame) => {
    const entry = seedingStatus.find((s) => s.gameId === game.id);
    if (entry) {
      const rawStatus = (entry as { status?: unknown }).status;
      return rawStatus === "seeding" || rawStatus === 5;
    }
    return game.download?.status === "seeding";
  };

  const isGameDownloadingMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const game of library) {
      map[game.id] =
        lastPacket?.gameId === game.id ||
        optimisticallyResumed[game.id] === true;
    }
    return map;
  }, [library, lastPacket?.gameId, optimisticallyResumed]);

  const { formatDistance } = useDate();

  const getFinalDownloadSize = (game: LibraryGame) => {
    const download = game.download!;
    const isGameDownloading = isGameDownloadingMap[game.id];

    if (
      isGameDownloading &&
      lastPacket?.download.fileSize &&
      lastPacket.download.fileSize > 0
    )
      return formatBytes(lastPacket.download.fileSize);

    if (download.fileSize != null && download.fileSize > 0)
      return formatBytes(download.fileSize);

    return "N/A";
  };

  const formatSpeed = (speed: number): string => {
    return userPreferences?.showDownloadSpeedInMegabytes
      ? `${formatBytes(speed)}/s`
      : formatBytesToMbps(speed);
  };

  const calculateETA = () => {
    if (
      !lastPacket ||
      lastPacket.timeRemaining <= 0 ||
      !Number.isFinite(lastPacket.timeRemaining)
    ) {
      return null;
    }

    return formatDistance(
      addMilliseconds(new Date(), lastPacket.timeRemaining),
      new Date(),
      { addSuffix: true }
    );
  };

  const extractGameDownload = useCallback(
    async (shop: GameShop, objectId: string) => {
      await window.electron.extractGameDownload(shop, objectId);
      updateLibrary();
    },
    [updateLibrary]
  );

  const handleCancelClick = useCallback((shop: GameShop, objectId: string) => {
    setGameToCancelShop(shop);
    setGameToCancelObjectId(objectId);
    setCancelModalVisible(true);
  }, []);

  const handleConfirmCancel = useCallback(async () => {
    if (gameToCancelShop && gameToCancelObjectId) {
      await cancelDownload(gameToCancelShop, gameToCancelObjectId);
    }
    setCancelModalVisible(false);
    setGameToCancelShop(null);
    setGameToCancelObjectId(null);
  }, [gameToCancelShop, gameToCancelObjectId, cancelDownload]);

  const handleCancelModalClose = useCallback(() => {
    setCancelModalVisible(false);
    setGameToCancelShop(null);
    setGameToCancelObjectId(null);
  }, []);

  const handleMoveInQueue = useCallback(
    async (shop: GameShop, objectId: string, direction: "up" | "down") => {
      await window.electron.updateDownloadQueuePosition(
        shop,
        objectId,
        direction
      );
      updateLibrary();
    },
    [updateLibrary]
  );

  const getActionsForGame = useCallback(
    (game: LibraryGame) =>
      getGameActions(
        game,
        isGameDownloadingMap[game.id] ?? false,
        queuedGameIds,
        isGameSeeding,
        isGameDeleting,
        extractGameDownload,
        pauseSeeding,
        resumeSeeding,
        openDeleteGameModal,
        pauseDownload,
        handleCancelClick,
        resumeDownload,
        handleMoveInQueue,
        t
      ),
    [
      isGameDownloadingMap,
      queuedGameIds,
      isGameSeeding,
      isGameDeleting,
      extractGameDownload,
      pauseSeeding,
      resumeSeeding,
      openDeleteGameModal,
      pauseDownload,
      handleCancelClick,
      resumeDownload,
      handleMoveInQueue,
      t,
    ]
  );

  const downloadInfo = useMemo(
    () =>
      library.map((game) => ({
        game,
        size: getFinalDownloadSize(game),
        progress: game.download?.progress || 0,
        isSeeding: isGameSeeding(game),
      })),
    [
      library,
      lastPacket?.gameId,
      lastPacket?.download.fileSize,
      isGameDownloadingMap,
      seedingStatus,
    ]
  );

  useEffect(() => {
    const fetchActionTypes = async () => {
      const completedGames = library.filter(
        (game) => game.download?.progress === 1
      );

      const actionTypesPromises = completedGames.map(async (game) => {
        try {
          const actionType = await window.electron.getGameInstallerActionType(
            game.shop,
            game.objectId
          );
          return { gameId: game.id, actionType };
        } catch {
          return { gameId: game.id, actionType: "open-folder" as const };
        }
      });

      const results = await Promise.all(actionTypesPromises);
      const newActionTypes: Record<string, "install" | "open-folder"> = {};
      results.forEach(({ gameId, actionType }) => {
        newActionTypes[gameId] = actionType;
      });

      setGameActionTypes((prev) => ({ ...prev, ...newActionTypes }));
    };

    fetchActionTypes();
  }, [library]);

  const isDownloadingGroup = title === t("download_in_progress");
  const isQueuedGroup = title === t("queued_downloads");
  const isCompletedGroup = title === t("downloads_completed");

  let heroView: {
    game: LibraryGame;
    isGameExtracting: boolean;
    isGameDownloading: boolean;
    downloadSpeed: number;
    finalDownloadSize: string;
    peakSpeed: number;
    currentProgress: number;
    dominantColor: string;
    gameSpeedHistory: number[];
  } | null = null;

  if (isDownloadingGroup && library.length > 0) {
    const game = library[0];
    const isGameExtracting = extraction?.visibleId === game.id;
    const isGameDownloadingVal =
      isGameDownloadingMap[game.id] && !isGameExtracting;
    const downloadSpeed = isGameDownloadingVal
      ? (lastPacket?.downloadSpeed ?? 0)
      : 0;
    const finalDownloadSize = getFinalDownloadSize(game);
    const dataKey = lastPacket?.gameId ?? game.id;
    const gameSpeedHistory = speedHistory[dataKey] ?? [];
    const storedPeak = peakSpeeds[dataKey];
    const peakSpeedVal =
      storedPeak !== undefined && storedPeak > 0 ? storedPeak : downloadSpeed;

    let currentProgressVal = game.download?.progress || 0;
    if (isGameExtracting) {
      currentProgressVal = extraction.progress;
    } else if (isGameDownloadingVal && lastPacket) {
      currentProgressVal = lastPacket.progress;
    }

    const dominantColor = pickChartColor(dominantColors[game.id]);

    heroView = {
      game,
      isGameExtracting,
      isGameDownloading: isGameDownloadingVal,
      downloadSpeed,
      finalDownloadSize,
      peakSpeed: peakSpeedVal,
      currentProgress: currentProgressVal,
      dominantColor,
      gameSpeedHistory,
    };
  }

  return {
    heroView,
    lastPacket,
    isQueuedGroup,
    isCompletedGroup,
    cancelModalVisible,
    downloadInfo,
    gameActionTypes,
    isGameDeleting,
    formatSpeed,
    calculateETA,
    pauseDownload,
    resumeDownload,
    handleCancelClick,
    handleConfirmCancel,
    handleCancelModalClose,
    getActionsForGame,
  };
}
