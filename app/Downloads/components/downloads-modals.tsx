import "./downloads-modals.scss";
import { Modal } from "@renderer/components";
import { DeleteGameModal } from "./delete-game-modal";
import { ProtonRecommendationModal } from "@provision/proton_recommended/ui/proton-recommendation-modal";
import { InstallProgressModal } from "@provision/ForgePipeline/ui/install-progress-modal";
import { ExecutableCandidateModal } from "@provision/ForgePipeline/ui/executable-candidate-modal";
import { ScanningPrefixModal } from "@provision/ForgePipeline/ui/scanning-prefix-modal";
import { CopyingGameModal } from "@provision/ForgePipeline/ui/copying-game-modal";
import { useTranslation } from "react-i18next";
import type { ProtonVersion } from "@types";

interface DownloadsModalsProps {
  showDeleteModal: boolean;
  onCloseDeleteModal: () => void;
  deleteGame: () => void;
  installedProtons: ProtonVersion[];
  showRecommendationModal: boolean;
  onCloseRecommendation: () => void;
  onSelectProton: (proton: string) => void;
  onDownloadAndSelect: (proton: string) => void;
  gameId: string | null;
  gameTitle: string | null;
  installProgress: number | null;
  onCloseInstallProgress: () => void;
  showScanningModal: boolean;
  showCopyingModal: boolean;
  showCandidateModal: boolean;
  candidates: unknown[];
  prefixDriveCPath: string | null;
  onExePicked: (exe: string) => void;
  onBrowseExe: () => void;
  onCloseCandidate: () => void;
  showInstallSuccessModal: boolean;
  onCloseInstallSuccess: () => void;
  onNavigateToGames: () => void;
}

export function DownloadsModals({
  showDeleteModal,
  onCloseDeleteModal,
  deleteGame,
  installedProtons,
  showRecommendationModal,
  onCloseRecommendation,
  onSelectProton,
  onDownloadAndSelect,
  gameId,
  gameTitle,
  installProgress,
  onCloseInstallProgress,
  showScanningModal,
  showCopyingModal,
  showCandidateModal,
  candidates,
  prefixDriveCPath,
  onExePicked,
  onBrowseExe,
  onCloseCandidate,
  showInstallSuccessModal,
  onCloseInstallSuccess,
  onNavigateToGames,
}: Readonly<DownloadsModalsProps>) {
  const { t } = useTranslation("downloads");

  return (
    <>
      <DeleteGameModal
        visible={showDeleteModal}
        onClose={onCloseDeleteModal}
        deleteGame={deleteGame}
      />

      <ProtonRecommendationModal
        visible={showRecommendationModal}
        gameId={gameId}
        gameTitle={gameTitle}
        installedProtons={installedProtons}
        onClose={onCloseRecommendation}
        onSelect={onSelectProton}
        onDownloadAndSelect={onDownloadAndSelect}
      />

      <InstallProgressModal
        visible={installProgress != null}
        progress={installProgress}
        onClose={onCloseInstallProgress}
      />

      <ScanningPrefixModal visible={showScanningModal} />

      <CopyingGameModal visible={showCopyingModal} />

      <ExecutableCandidateModal
        visible={showCandidateModal}
        candidates={candidates}
        prefixDriveCPath={prefixDriveCPath}
        onSelect={onExePicked}
        onBrowse={onBrowseExe}
        onClose={onCloseCandidate}
      />

      <Modal
        visible={showInstallSuccessModal}
        title={t("install_success_title")}
        description={t("install_success_desc")}
        onClose={onCloseInstallSuccess}
      >
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
            marginTop: "1rem",
          }}
        >
          <button
            onClick={onNavigateToGames}
            className="downloads-modals__install-success-btn"
          >
            {t("install_success_ok")}
          </button>
        </div>
      </Modal>
    </>
  );
}
