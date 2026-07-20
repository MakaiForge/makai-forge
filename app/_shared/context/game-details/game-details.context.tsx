import { createContext, useCallback, useEffect, useRef, useState } from "react";

import { setHeaderTitle } from "@features";
import { storeService } from "@shared-services/store.service";
import { orderBy } from "lodash-es";
import { getSteamLanguage } from "@shared-helpers";
import { useAppDispatch, useAppSelector, useDownload } from "@hooks";

import type {
  DownloadSource,
  GameRepack,
  GameShop,
  LibraryGame,
  ShopDetailsWithAssets,
} from "@types";

import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import {
  GameDetailsContext,
  GameOptionsCategoryId,
} from "./game-details.context.types";
import { SteamContentDescriptor } from "@shared";

export const gameDetailsContext = createContext<GameDetailsContext>({
  game: null,
  shopDetails: null,
  repacks: [],
  shop: "steam",
  gameTitle: "",
  isGameRunning: false,
  isLoading: false,
  objectId: undefined,
  showRepacksModal: false,
  showGameOptionsModal: false,
  gameOptionsInitialCategory: "general",
  hasNSFWContentBlocked: false,
  lastDownloadedOption: null,
  isTransferring: false,
  transferProgress: 0,
  selectGameExecutable: async () => null,
  updateGame: async () => {},
  setShowGameOptionsModal: () => {},
  setGameOptionsInitialCategory: () => {},
  setShowRepacksModal: () => {},
  setHasNSFWContentBlocked: () => {},
  cancelTransfer: () => {},
});

const { Provider } = gameDetailsContext;
export const { Consumer: GameDetailsContextConsumer } = gameDetailsContext;

export interface GameDetailsContextProps {
  children: React.ReactNode;
  objectId: string;
  gameTitle: string;
  shop: GameShop;
}

export function GameDetailsContextProvider({
  children,
  objectId,
  gameTitle,
  shop,
}: Readonly<GameDetailsContextProps>) {
  const [shopDetails, setShopDetails] = useState<ShopDetailsWithAssets | null>(
    null
  );
  const [game, setGame] = useState<LibraryGame | null>(null);
  const [hasNSFWContentBlocked, setHasNSFWContentBlocked] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [showRepacksModal, setShowRepacksModal] = useState(false);
  const [showGameOptionsModal, setShowGameOptionsModal] = useState(false);
  const [gameOptionsInitialCategory, setGameOptionsInitialCategory] =
    useState<GameOptionsCategoryId>("general");
  const [repacks, setRepacks] = useState<GameRepack[]>([]);

  const { i18n } = useTranslation("game_details");
  const location = useLocation();

  const dispatch = useAppDispatch();

  const { lastPacket } = useDownload();

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const updateGame = useCallback(async () => {
    return window.electron
      .getGameByObjectId(shop, objectId)
      .then((result) => setGame(result));
  }, [shop, objectId]);

  const isGameDownloading =
    lastPacket?.gameId === game?.id && game?.download?.status === "active";

  useEffect(() => {
    updateGame();
  }, [updateGame, isGameDownloading, lastPacket?.gameId]);

  // Listen for transfer events
  useEffect(() => {
    const onTransferProgress = (
      _: unknown,
      shop: string,
      objectId: string,
      progress: number
    ) => {
      if (shop === game?.shop && objectId === game?.objectId) {
        setIsTransferring(progress >= 0 && progress < 1);
        setTransferProgress(progress);
      }
    };

    const onTransferComplete = (_: unknown, shop: string, objectId: string) => {
      if (shop === game?.shop && objectId === game?.objectId) {
        setIsTransferring(false);
        setTransferProgress(0);
        updateGame();
      }
    };

    const onTransferCancelled = (
      _: unknown,
      shop: string,
      objectId: string
    ) => {
      if (shop === game?.shop && objectId === game?.objectId) {
        setIsTransferring(false);
        setTransferProgress(0);
      }
    };

    const onTransferError = (_: unknown, shop: string, objectId: string) => {
      if (shop === game?.shop && objectId === game?.objectId) {
        setIsTransferring(false);
        setTransferProgress(0);
      }
    };

    window.electron.on("on-game-transfer-progress", onTransferProgress);
    window.electron.on("on-game-transfer-complete", onTransferComplete);
    window.electron.on("on-game-transfer-cancelled", onTransferCancelled);
    window.electron.on("on-game-transfer-error", onTransferError);

    return () => {
      window.electron.off("on-game-transfer-progress", onTransferProgress);
      window.electron.off("on-game-transfer-complete", onTransferComplete);
      window.electron.off("on-game-transfer-cancelled", onTransferCancelled);
      window.electron.off("on-game-transfer-error", onTransferError);
    };
  }, [game]);

  useEffect(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const shopDetailsPromise = window.electron
      .getGameShopDetails(objectId, shop, getSteamLanguage(i18n.language))
      .then((result) => {
        if (abortController.signal.aborted) return;

        setShopDetails(result);

        if (
          result?.content_descriptors.ids.includes(
            SteamContentDescriptor.AdultOnlySexualContent
          ) &&
          !userPreferences?.disableNsfwAlert
        ) {
          setHasNSFWContentBlocked(true);
        }
      });

    const assetsPromise = window.electron.getGameAssets(objectId, shop);

    Promise.all([shopDetailsPromise, assetsPromise])
      .then(([_, assets]) => {
        if (assets) {
          if (abortController.signal.aborted) return;
          setShopDetails((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              assets,
            };
          });
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [updateGame, dispatch, objectId, shop, i18n.language, userPreferences]);

  useEffect(() => {
    setShopDetails(null);
    setGame(null);
    setIsLoading(true);
    setIsGameRunning(false);
    setGameOptionsInitialCategory("general");
    dispatch(setHeaderTitle(gameTitle));
  }, [objectId, gameTitle, dispatch]);

  useEffect(() => {
    const state =
      (location && (location.state as Record<string, unknown>)) || {};
    if (state.openRepacks) {
      setShowRepacksModal(true);
      try {
        window.history.replaceState({}, document.title, location.pathname);
      } catch (e) {
        console.error(e);
      }
    }
  }, [location]);

  useEffect(() => {
    if (game?.title) {
      dispatch(setHeaderTitle(game.title));
    }
  }, [game?.title, dispatch]);

  useEffect(() => {
    const unsubscribe = window.electron.onGamesRunning((gamesIds) => {
      const updatedIsGameRunning =
        !!game?.id &&
        !!gamesIds.find((gameRunning) => gameRunning.id == game.id);

      if (isGameRunning != updatedIsGameRunning) {
        updateGame();
      }

      setIsGameRunning(updatedIsGameRunning);
    });

    return () => {
      unsubscribe();
    };
  }, [game?.id, isGameRunning, updateGame]);

  useEffect(() => {
    const unsubscribe = window.electron.onLibraryBatchComplete(() => {
      updateGame();
    });

    return () => {
      unsubscribe();
    };
  }, [updateGame]);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        if (detail.objectId && detail.objectId === objectId) {
          setShowRepacksModal(true);
        }
      } catch (e) {
        void e;
      }
    };

    window.addEventListener("protonforge:openRepacks", handler as EventListener);

    return () => {
      window.removeEventListener("protonforge:openRepacks", handler as EventListener);
    };
  }, [objectId]);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        if (detail.objectId && detail.objectId === objectId) {
          setGameOptionsInitialCategory("general");
          setShowGameOptionsModal(true);
        }
      } catch (e) {
        void e;
      }
    };

    window.addEventListener("protonforge:openGameOptions", handler as EventListener);

    return () => {
      window.removeEventListener(
        "protonforge:openGameOptions",
        handler as EventListener
      );
    };
  }, [objectId]);

  useEffect(() => {
    const state =
      (location && (location.state as Record<string, unknown>)) || {};
    if (state.openGameOptions) {
      setGameOptionsInitialCategory("general");
      setShowGameOptionsModal(true);

      try {
        window.history.replaceState({}, document.title, location.pathname);
      } catch (_e) {
        void _e;
      }
    }
  }, [location]);

  const fetchDownloadSources = useCallback(async () => {
    try {
      const sourcesRaw = (await storeService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sources = orderBy(sourcesRaw, "createdAt", "desc");

      const params: Record<string, any> = {
        take: 100,
        skip: 0,
        downloadSourceIds: sources.map((source) => source.id),
      };

      if (shop === "custom") {
        params.title = gameTitle;
      }

      const downloads = await window.electron.forgerApi.get<GameRepack[]>(
        `/games/${shop}/${objectId}/download-sources`,
        {
          params,
          needsAuth: false,
        }
      );

      let merged = downloads;

      try {
        const pirate = await window.electron.getGameData(shop, objectId);
        console.log("[game-details] pirate data:", shop, objectId, pirate ? { hasSources: pirate.downloadSources?.length, hasDownloads: pirate.downloads?.length } : null);
        if (pirate && pirate.downloads?.length > 0) {
          const repacks: GameRepack[] = pirate.downloads.map((d: any, i: number) => ({
            id: `pirate-${shop}-${objectId}-${i}`,
            title: d.title,
            fileSize: d.fileSize ?? null,
            uris: d.uris ?? [],
            unavailableUris: [],
            uploadDate: d.uploadDate ?? null,
            downloadSourceId: `pirate-${d.downloadSourceName?.toLowerCase() ?? "unknown"}`,
            downloadSourceName: d.downloadSourceName ?? "Pirate",
            createdAt: d.uploadDate ?? new Date().toISOString(),
            recommended: d.recommended ?? false,
          }));
          merged = [...downloads, ...repacks];
        }
      } catch {
        /* noop */
      }

      setRepacks(merged);
    } catch (error) {
      console.error("Failed to fetch download sources:", error);
    }
  }, [shop, objectId, gameTitle]);

  useEffect(() => {
    fetchDownloadSources();
  }, [fetchDownloadSources]);

  useEffect(() => {
    const onUnlock = () => fetchDownloadSources();
    window.addEventListener("supplemental-unlocked", onUnlock);
    return () => window.removeEventListener("supplemental-unlocked", onUnlock);
  }, [fetchDownloadSources]);

  const getDownloadsPath = async () => {
    if (userPreferences?.downloadsPath) return userPreferences.downloadsPath;
    return window.electron.getDefaultDownloadsPath();
  };

  const selectGameExecutable = async () => {
    const downloadsPath = await getDownloadsPath();

    return window.electron
      .showOpenDialog({
        properties: ["openFile"],
        defaultPath: downloadsPath,
        filters: [
          {
            name: "Game executable",
            extensions: ["exe", "lnk"],
          },
        ],
      })
      .then(({ filePaths }) => {
        if (filePaths && filePaths.length > 0) {
          return filePaths[0];
        }

        return null;
      });
  };

  // Handlers for cancel
  const cancelTransfer = () => {
    window.electron.cancelGameTransfer?.(shop, objectId);
    setIsTransferring(false);
    setTransferProgress(0);
  };

  return (
    <Provider
      value={{
        game,
        shopDetails,
        shop,
        repacks,
        gameTitle,
        isGameRunning,
        isLoading,
        objectId,
        showGameOptionsModal,
        gameOptionsInitialCategory,
        showRepacksModal,
        hasNSFWContentBlocked,
        lastDownloadedOption: null,
        isTransferring,
        transferProgress,
        setHasNSFWContentBlocked,
        selectGameExecutable,
        updateGame,
        setShowRepacksModal,
        setShowGameOptionsModal,
        setGameOptionsInitialCategory,
        cancelTransfer,
      }}
    >
      {children}
    </Provider>
  );
}
