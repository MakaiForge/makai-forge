import "./downloads-modals.scss";
import { Modal } from "@components";
import { DeleteGameModal } from "./delete-game-modal";
import { ProtonRecommendationModal } from "@provision/proton_recommended/ui/proton-recommendation-modal";
import { InstallProgressModal } from "@provision/ForgePipeline/ui/install-progress/InstallProgressModal";
import { ExecutableCandidateModal } from "@provision/ForgePipeline/ui/executable-candidate-modal";
import { CopyingGameModal } from "@provision/ForgePipeline/ui/copying-game-modal";
import { useTranslation } from "react-i18next";
import type { ProtonVersion, ProtonFork } from "@types";
import type { CandidateExe } from "@provision/ForgePipeline/ui/install-flow/use-install-flow";
import type { InstallProgress } from "@provision/ForgePipeline/ui/install-progress/types";

interface DownloadsModalsProps {
  showDeleteModal: boolean;
  onCloseDeleteModal: () => void;
  deleteGame: () => void;
  installedProtons: ProtonVersion[];
  showRecommendationModal: boolean;
  onCloseRecommendation: () => void;
  onSelectProton: (protonPath: string) => void;
  onDownloadAndSelect: (fork: ProtonFork) => Promise<void>;
  gameId: string;
  gameTitle: string;
  installProgress: InstallProgress | null;
  onCloseInstallProgress: () => void;
  showCopyingModal: boolean;
  showCandidateModal: boolean;
  candidates: CandidateExe[];
  prefixDriveCPath: string;
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
