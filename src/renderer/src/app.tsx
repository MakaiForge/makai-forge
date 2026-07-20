import { BottomPanel, Header, Sidebar, Toast } from "@components";
import {
  useAppDispatch,
  useAppSelector,
  useDownload,
  useLibrary,
  useMakaiNotifications,
  useToast,
  useUserDetails,
} from "@hooks";
import { useDownloadOptionsListener } from "@hooks/use-download-options-listener";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearExtraction,
  closeToast,
  setExtractionProgress,
  setGameRunning,
  setProfileBackground,
  setUserDetails,
  setUserPreferences,
  toggleDraggingDisabled,
} from "@features";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { ArchiveDeletionModal } from "@downloads/components/archive-deletion-error-modal";

import type { UserPreferences } from "@types";
import "../../../app/app.scss";
import { ThemeProvider } from "@theme/ThemeProvider";
import { storeService } from "@shared-services/store.service";

export interface AppProps {
  children: React.ReactNode;
}

export function App() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { updateLibrary, library } = useLibrary();

  // Listen for new download options updates
  useDownloadOptionsListener();

  const { t } = useTranslation("app");

  const { clearDownload, setLastPacket } = useDownload();

  const { fetchUserDetails, updateUserDetails, clearUserDetails } =
    useUserDetails();

  const dispatch = useAppDispatch();

  const location = useLocation();

  const draggingDisabled = useAppSelector(
    (state) => state.window.draggingDisabled
  );

  const toast = useAppSelector((state) => state.toast);

  const { showSuccessToast, showErrorToast } = useToast();

  useMakaiNotifications();

  const [showArchiveDeletionModal, setShowArchiveDeletionModal] =
    useState(false);
  const [archivePaths, setArchivePaths] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      storeService.get("userPreferences", null, "json"),
      updateLibrary(),
    ]).then(([preferences]) => {
      dispatch(setUserPreferences(preferences as UserPreferences | null));
    });
  }, [dispatch, updateLibrary]);

  useEffect(() => {
    const unsubscribe = window.electron.onDownloadProgress(
      (downloadProgress) => {
        if (
          downloadProgress?.progress === 1 &&
          !downloadProgress.isCheckingFiles &&
          !downloadProgress.isDownloadingMetadata
        ) {
          clearDownload();
          return;
        }

        setLastPacket(downloadProgress);
      }
    );

    const unsubProton = window.electron.onProtonDownloadProgress((progress) => {
      if (progress) {
        window.dispatchEvent(
          new CustomEvent("proton-download-progress", { detail: progress })
        );
      } else {
        window.dispatchEvent(new CustomEvent("proton-download-complete"));
      }
    });

    return () => {
      unsubscribe();
      unsubProton();
    };
  }, [clearDownload, setLastPacket, updateLibrary]);

  useEffect(() => {
    const unsubscribe = window.electron.onHardDelete(() => {});

    return () => unsubscribe();
  }, []);

  const setupExternalResources = useCallback(async () => {
    const cachedUserDetails = window.localStorage.getItem("userDetails");

    if (cachedUserDetails) {
      const { profileBackground, ...userDetails } =
        JSON.parse(cachedUserDetails);

      dispatch(setUserDetails(userDetails));
      dispatch(setProfileBackground(profileBackground));
    }

    const userPreferences = await window.electron.getUserPreferences();
    const userDetails = await fetchUserDetails().catch(() => null);

    if (userDetails) {
      updateUserDetails(userDetails);
    }
  }, [fetchUserDetails, updateUserDetails, dispatch]);

  useEffect(() => {
    setupExternalResources();
  }, [setupExternalResources]);

  const onSignIn = useCallback(() => {
    fetchUserDetails().then((response) => {
      if (response) {
        updateUserDetails(response);
        showSuccessToast(t("successfully_signed_in"));
      }
    });
  }, [fetchUserDetails, t, showSuccessToast, updateUserDetails]);

  useEffect(() => {
    const unsubscribe = window.electron.onGamesRunning((gamesRunning) => {
      if (gamesRunning.length) {
        const lastGame = gamesRunning[gamesRunning.length - 1];
        const libraryGame = library.find(
          (library) => library.id === lastGame.id
        );

        if (libraryGame) {
          dispatch(
            setGameRunning({
              ...libraryGame,
              sessionDurationInMillis: lastGame.sessionDurationInMillis,
            })
          );
          return;
        }
      }
      dispatch(setGameRunning(null));
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch, library]);

  useEffect(() => {
    const listeners = [
      window.electron.onSignIn(onSignIn),
      window.electron.onLibraryBatchComplete(() => {}),
      window.electron.onSignOut(() => clearUserDetails()),
      window.electron.onExtractionProgress((shop, objectId, progress) => {
        dispatch(setExtractionProgress({ shop, objectId, progress }));
      }),
      window.electron.onExtractionComplete(() => {
        dispatch(clearExtraction());
      }),
      window.electron.onExtractionFailed(() => {
        dispatch(clearExtraction());
        showErrorToast(
          t("extraction_failed_title", { ns: "downloads" }),
          t("extraction_failed_description", { ns: "downloads" })
        );
      }),
      window.electron.onArchiveDeletionPrompt((paths) => {
        setArchivePaths(paths);
        setShowArchiveDeletionModal(true);
      }),
    ];

    return () => {
      listeners.forEach((unsubscribe) => unsubscribe());
    };
  }, [onSignIn, updateLibrary, clearUserDetails, dispatch, showErrorToast, t]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [location.pathname, location.search]);

  useEffect(() => {
    new MutationObserver(() => {
      const modal = document.body.querySelector("[data-protonforge-dialog]");

      dispatch(toggleDraggingDisabled(Boolean(modal)));
    }).observe(document.body, {
      attributes: false,
      childList: true,
    });
  }, [dispatch, draggingDisabled]);

  const handleToastClose = useCallback(() => {
    dispatch(closeToast());
  }, [dispatch]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };

    const onDrop = async (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.makaitheme')) return;

      e.preventDefault();
      showSuccessToast('Importando tema…');

      try {
        const buffer = await file.arrayBuffer();
        const theme = await window.electron.importMakaiTheme(buffer);
        if (theme) {
          await window.electron.toggleCustomTheme(theme.id, true);
          showSuccessToast(t('theme_imported', { ns: 'settings' }));
        }
      } catch (err) {
        console.error('[ThemeDrop] import failed:', err);
        showErrorToast(t('error_importing_theme', { ns: 'settings' }));
      }
    };

    document.body.addEventListener('dragover', onDragOver);
    document.body.addEventListener('drop', onDrop);

    return () => {
      document.body.removeEventListener('dragover', onDragOver);
      document.body.removeEventListener('drop', onDrop);
    };
  }, [showSuccessToast, showErrorToast, t]);

  return (
    <ThemeProvider>
      <Toast
        visible={toast.visible}
        title={toast.title}
        message={toast.message}
        type={toast.type}
        onClose={handleToastClose}
        duration={toast.duration}
      />

      <ArchiveDeletionModal
        visible={showArchiveDeletionModal}
        archivePaths={archivePaths}
        onClose={() => setShowArchiveDeletionModal(false)}
      />

      <main>
        <Sidebar />

        <article className="container">
          <Header />

          <section
            ref={contentRef}
            id="scrollableDiv"
            className="container__content"
          >
            <Outlet />
          </section>
        </article>
      </main>

      <BottomPanel />
    </ThemeProvider>
  );
}
