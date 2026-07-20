import { useTranslation } from "react-i18next";
import { ConfirmationModal } from "@renderer/components";
import type { GameShop } from "@types";
import type { DownloadGroupProps } from "../types";
import { useDownloadsGroup } from "../hooks/useDownloadsGroup";
import { DownloadAtivo } from "./download-ativo/download-ativo";
import { DownloadParado } from "./download-parado/download-parado";
import { DownloadConcluido } from "./download-concluido/download-concluido";
import { DownloadCard } from "./shared/download-card/download-card";
import "./download-group.scss";

export function DownloadGroup({
  library,
  title,
  openDeleteGameModal,
  openGameInstaller,
  openRemoveGameModal,
  seedingStatus,
  queuedGameIds = [],
}: Readonly<DownloadGroupProps>) {
  const { t } = useTranslation("downloads");

  const {
    heroView,
    lastPacket,
    isQueuedGroup,
    isCompletedGroup,
    cancelModalVisible,
    downloadInfo,
    formatSpeed,
    calculateETA,
    pauseDownload,
    resumeDownload,
    handleCancelClick,
    handleConfirmCancel,
    handleCancelModalClose,
  } = useDownloadsGroup(
    library,
    title,
    openDeleteGameModal,
    seedingStatus,
    queuedGameIds
  );

  if (!library.length) return null;

  const heroGameId = heroView?.game.id;
  const cardItems = heroGameId
    ? downloadInfo.filter((d) => d.game.id !== heroGameId)
    : downloadInfo;

  return (
    <>
      <ConfirmationModal
        visible={cancelModalVisible}
        title={t("cancel_download")}
        descriptionText={t("cancel_download_description")}
        confirmButtonLabel={t("yes_cancel")}
        cancelButtonLabel={t("keep_downloading")}
        onConfirm={handleConfirmCancel}
        onClose={handleCancelModalClose}
      />

      {heroView && (
        <DownloadAtivo
          game={heroView.game}
          isGameDownloading={heroView.isGameDownloading}
          isGameExtracting={heroView.isGameExtracting}
          downloadSpeed={heroView.downloadSpeed}
          finalDownloadSize={heroView.finalDownloadSize}
          peakSpeed={heroView.peakSpeed}
          currentProgress={heroView.currentProgress}
          dominantColor={heroView.dominantColor}
          lastPacket={lastPacket}
          speedHistory={heroView.gameSpeedHistory}
          formatSpeed={formatSpeed}
          calculateETA={calculateETA}
          pauseDownload={pauseDownload}
          resumeDownload={resumeDownload}
          onCancelClick={handleCancelClick}
          t={t}
        />
      )}

      {isQueuedGroup && cardItems.length > 0 && (
        <DownloadParado
          library={cardItems.map((d) => d.game)}
          onResume={(shop, objectId) => resumeDownload(shop, objectId)}
          onCancel={(shop, objectId) => handleCancelClick(shop, objectId)}
        />
      )}

      {isCompletedGroup && cardItems.length > 0 && (
        <DownloadConcluido
          library={cardItems.map((d) => d.game)}
          onInstall={openGameInstaller}
          onCancel={(shop, objectId) => handleCancelClick(shop, objectId)}
          onRemove={(shop, objectId, title) => openRemoveGameModal(shop, objectId, title)}
        />
      )}

      {!isQueuedGroup && !isCompletedGroup && cardItems.length > 0 && (
        <div className="download-group">
          <div className="download-group__card-grid">
            {cardItems.map(({ game, progress }) => (
              <DownloadCard
                key={game.id}
                game={game}
                progress={progress}
                isPaused={!isCompletedGroup}
                isCompleted={false}
                isActive={false}
                onResume={(shop, objectId) =>
                  resumeDownload(shop, objectId)
                }
                onCancel={(shop, objectId) =>
                  handleCancelClick(shop, objectId)
                }
                onInstall={undefined}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
