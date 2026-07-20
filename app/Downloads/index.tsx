import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useLibrary } from "@renderer/hooks";
import "./downloads.scss";
import { DownloadsContent } from "./components/downloads-content";
import { DownloadsModals } from "./components/downloads-modals";
import { RemoveGameModal } from "./components/remove-game-modal";
import { useDownload } from "@provision/ForgePipeline/ui/use-download";
import { useInstallFlow } from "@provision/proton_recommended/ui/use-install-flow";
import type { GameShop, SeedingStatus } from "@types";

export default function Downloads() {
  const [activeSubTab, setActiveSubTab] = useState<"downloads" | "qbittorrent">(
    "downloads"
  );

  const { t } = useTranslation("downloads");

  const gameToBeDeleted = useRef<[GameShop, string] | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const gameToRemove = useRef<[GameShop, string, string] | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const { removeGameInstaller, pauseSeeding } = useDownload();
  const { updateLibrary } = useLibrary();

  const {
    showRecommendationModal,
    setShowRecommendationModal,
    showCandidateModal,
    setShowCandidateModal,
    showScanningModal,
    setShowScanningModal,
    showCopyingModal,
    setShowCopyingModal,
    showInstallSuccessModal,
    setShowInstallSuccessModal,
    installProgress,
    setInstallProgress,
    installedProtons,
    candidates,
    prefixDriveCPath,
    pendingGameRef,
    pendingInstallRef,
    pendingGameIdRef,
    pendingGameTitleRef,
    handleOpenGameInstaller,
    handleSelectProton,
    handleDownloadAndSelect,
    handleExePicked,
    handleOpenExePicker,
    handleNavigateToGames,
  } = useInstallFlow();

  const [seedingStatus, setSeedingStatus] = useState<SeedingStatus[]>([]);

  useEffect(() => {
    window.electron.onSeedingStatus((value) => setSeedingStatus(value));

    const unsubscribeExtraction = window.electron.onExtractionComplete(() => {
      updateLibrary();
    });

    return () => {
      unsubscribeExtraction();
    };
  }, [updateLibrary]);

  const handleDeleteGame = async () => {
    if (gameToBeDeleted.current) {
      const [shop, objectId] = gameToBeDeleted.current;
      await pauseSeeding(shop, objectId);
      await removeGameInstaller(shop, objectId);
    }
  };

  const handleOpenRemoveGameModal = (
    shop: GameShop,
    objectId: string,
    title: string
  ) => {
    gameToRemove.current = [shop, objectId, title];
    setShowRemoveModal(true);
  };

  const handleRemoveFromList = async () => {
    if (gameToRemove.current) {
      const [shop, objectId] = gameToRemove.current;
      await window.electron.removeGame(shop, objectId);
      updateLibrary();
    }
    setShowRemoveModal(false);
    gameToRemove.current = null;
  };

  const handleDeleteEverything = async () => {
    if (gameToRemove.current) {
      const [shop, objectId] = gameToRemove.current;
      await removeGameInstaller(shop, objectId);
    }
    setShowRemoveModal(false);
    gameToRemove.current = null;
  };

  return (
    <div className="downloads">
      <RemoveGameModal
        visible={showRemoveModal}
        gameTitle={gameToRemove.current?.[2] ?? ""}
        onClose={() => {
          setShowRemoveModal(false);
          gameToRemove.current = null;
        }}
        onRemoveFromList={handleRemoveFromList}
        onDeleteEverything={handleDeleteEverything}
      />
      <DownloadsModals
        showDeleteModal={showDeleteModal}
        onCloseDeleteModal={() => setShowDeleteModal(false)}
        deleteGame={handleDeleteGame}
        installedProtons={installedProtons}
        showRecommendationModal={showRecommendationModal}
        onCloseRecommendation={() => {
          setShowRecommendationModal(false);
          pendingInstallRef.current = null;
          pendingGameRef.current = null;
        }}
        onSelectProton={handleSelectProton}
        onDownloadAndSelect={handleDownloadAndSelect}
        gameId={pendingGameIdRef.current}
        gameTitle={pendingGameTitleRef.current}
        installProgress={installProgress}
        onCloseInstallProgress={() => setInstallProgress(null)}
        showScanningModal={showScanningModal}
        showCopyingModal={showCopyingModal}
        showCandidateModal={showCandidateModal}
        candidates={candidates}
        prefixDriveCPath={prefixDriveCPath}
        onExePicked={handleExePicked}
        onBrowseExe={() => handleOpenExePicker()}
        onCloseCandidate={() => {
          setShowCandidateModal(false);
          pendingGameRef.current = null;
        }}
        showInstallSuccessModal={showInstallSuccessModal}
        onCloseInstallSuccess={() => setShowInstallSuccessModal(false)}
        onNavigateToGames={handleNavigateToGames}
      />

      <div className="downloads__sub-tabs">
        <button
          className={`downloads__sub-tab ${activeSubTab === "downloads" ? "downloads__sub-tab--active" : ""}`}
          onClick={() => setActiveSubTab("downloads")}
        >
          {t("download_in_progress")}
        </button>
        <button
          className={`downloads__sub-tab ${activeSubTab === "qbittorrent" ? "downloads__sub-tab--active" : ""}`}
          onClick={() => setActiveSubTab("qbittorrent")}
        >
          qBittorrent
        </button>
      </div>

      {activeSubTab === "downloads" && (
        <DownloadsContent
          seedingStatus={seedingStatus}
          handleOpenDeleteGameModal={(shop, objectId) => {
            gameToBeDeleted.current = [shop, objectId];
            setShowDeleteModal(true);
          }}
          handleOpenGameInstaller={handleOpenGameInstaller}
          handleOpenRemoveGameModal={handleOpenRemoveGameModal}
        />
      )}

      {activeSubTab === "qbittorrent" && (
        <div className="downloads__qbittorrent">
          <webview
            src="http://localhost:8080"
            style={{ width: "100%", height: "100%" }}
            webpreferences="disablewebsecurity"
          />
        </div>
      )}
    </div>
  );
}


