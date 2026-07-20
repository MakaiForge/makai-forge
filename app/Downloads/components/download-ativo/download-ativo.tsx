import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@shared";
import { buildGameDetailsPath } from "@renderer/helpers";
import { ClockIcon, ColumnsIcon, DownloadIcon, GraphIcon, PlayIcon, XCircleIcon, FileIcon } from "@primer/octicons-react";
import { Badge } from "@renderer/components";
import { DOWNLOADER_NAME } from "@renderer/constants";
import { Downloader } from "@shared";
import type { GameShop, LibraryGame } from "@types";
import type { useDownload } from "@provision/ForgePipeline/ui/use-download";
import "./download-ativo.scss";
import { SpeedChart } from "../shared/speed-chart";
import { AnimatedPercentage } from "../shared/animated-percentage";

interface DownloadAtivoProps {
  game: LibraryGame;
  isGameDownloading: boolean;
  isGameExtracting?: boolean;
  downloadSpeed: number;
  finalDownloadSize: string;
  peakSpeed: number;
  currentProgress: number;
  dominantColor: string;
  lastPacket: ReturnType<typeof useDownload>["lastPacket"];
  speedHistory: number[];
  formatSpeed: (speed: number) => string;
  calculateETA: () => string | null;
  pauseDownload: (shop: GameShop, objectId: string) => void;
  resumeDownload: (shop: GameShop, objectId: string) => void;
  onCancelClick: (shop: GameShop, objectId: string) => void;
  t: (key: string) => string;
}

export function DownloadAtivo({
  game,
  isGameDownloading,
  isGameExtracting = false,
  downloadSpeed,
  finalDownloadSize,
  peakSpeed,
  currentProgress,
  dominantColor,
  lastPacket,
  speedHistory,
  formatSpeed,
  calculateETA,
  pauseDownload,
  resumeDownload,
  onCancelClick,
  t,
}: Readonly<DownloadAtivoProps>) {
  const navigate = useNavigate();
  const { t: tGameDetails } = useTranslation("game_details");

  const handleLogoClick = useCallback(() => {
    navigate(buildGameDetailsPath(game));
  }, [navigate, game]);

  const etaText = calculateETA();
  const hasEta =
    isGameDownloading &&
    !isGameExtracting &&
    !lastPacket?.isCheckingFiles &&
    !!etaText &&
    etaText.trim() !== "" &&
    etaText !== "0";
  const shouldShowEtaPlaceholder =
    isGameDownloading &&
    !isGameExtracting &&
    !lastPacket?.isCheckingFiles &&
    !hasEta;
  const shouldShowEta = hasEta || shouldShowEtaPlaceholder;

  const isPaused = !isGameDownloading && !isGameExtracting;

  return (
    <div className={`download-now${isPaused ? " download-now--paused" : ""}`}>
      <div className="download-now__bg">
        <img
          src={game.libraryHeroImageUrl || game.libraryImageUrl || ""}
          alt={game.title}
        />
        <div className="download-now__overlay" />
      </div>

      <div className="download-now__body">
        <div className="download-now__header">
          <div className="download-now__logo">
            {game.logoImageUrl ? (
              <button
                type="button"
                onClick={handleLogoClick}
                className="download-now__logo-btn"
              >
                <img src={game.logoImageUrl} alt={game.title} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLogoClick}
                className="download-now__logo-btn"
              >
                <h1>{game.title}</h1>
              </button>
            )}
          </div>
        </div>

        <div className="download-now__progress">
          <div className="download-now__progress-row download-now__progress-row--bar">
            <div className="download-now__progress-wrapper">
              <div className="download-now__progress-info">
                {isGameExtracting && (
                  <span className="download-now__progress-status">
                    {t("extracting")}
                  </span>
                )}
                {!isGameExtracting && lastPacket?.isCheckingFiles && (
                  <span className="download-now__progress-status">
                    {t("checking_files")}
                  </span>
                )}
                {!isGameExtracting && !lastPacket?.isCheckingFiles && (
                  <span className="download-now__progress-size">
                    <DownloadIcon size={14} />
                    {isGameDownloading && lastPacket
                      ? `${formatBytes(lastPacket.download.bytesDownloaded)} / ${finalDownloadSize}`
                      : `0 B / ${finalDownloadSize}`}
                  </span>
                )}
                <span></span>
              </div>
              <div className="download-now__progress-info">
                {!lastPacket?.isCheckingFiles && !isGameExtracting && (
                  <span className="download-now__progress-eta">
                    {shouldShowEta && (
                      <>
                        <ClockIcon size={14} />
                        {hasEta ? etaText : tGameDetails("calculating_eta")}
                      </>
                    )}
                  </span>
                )}
                <span className="download-now__progress-pct">
                  <AnimatedPercentage value={currentProgress} />
                </span>
              </div>
              <div className="download-now__progress-bar">
                <div
                  className={`download-now__progress-fill ${isGameExtracting ? "download-now__progress-fill--extraction" : ""}`}
                  style={{
                    width: `${currentProgress * 100}%`,
                  }}
                />
              </div>
            </div>
            {!isGameExtracting && (
              <div className="download-now__actions">
                {isGameDownloading ? (
                  <button
                    type="button"
                    onClick={() => pauseDownload(game.shop, game.objectId)}
                    className="download-now__btn"
                  >
                    <ColumnsIcon size={14} />
                    {t("pause")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => resumeDownload(game.shop, game.objectId)}
                    className="download-now__btn"
                  >
                    <PlayIcon size={14} />
                    {t("resume")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onCancelClick(game.shop, game.objectId)}
                  className="download-now__btn"
                >
                  <XCircleIcon size={14} />
                  {t("cancel")}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="download-now__stats">
          <div className="download-now__stats-col">
            <div className="download-now__stat">
              <span style={{ color: dominantColor, display: "flex" }}>
                <DownloadIcon size={16} />
              </span>
              <div className="download-now__stat-content">
                <span className="download-now__stat-label">
                  {t("network")}:
                </span>
                <span className="download-now__stat-value">
                  {isGameDownloading ? formatSpeed(downloadSpeed) : "0 B/s"}
                </span>
              </div>
            </div>

            <div className="download-now__stat">
              <span style={{ color: dominantColor, display: "flex" }}>
                <GraphIcon size={16} />
              </span>
              <div className="download-now__stat-content">
                <span className="download-now__stat-label">{t("peak")}:</span>
                <span className="download-now__stat-value">
                  {peakSpeed > 0 ? formatSpeed(peakSpeed) : "0 B/s"}
                </span>
              </div>
            </div>

            {game.download?.downloader === Downloader.Torrent &&
              isGameDownloading &&
              lastPacket &&
              (lastPacket.numSeeds > 0 || lastPacket.numPeers > 0) && (
                <div className="download-now__stat">
                  <div className="download-now__stat-content">
                    <span className="download-now__stat-label">
                      Seeds:{" "}
                      <span className="download-now__stat-value">
                        {lastPacket.numSeeds}
                      </span>
                      , Peers:{" "}
                      <span className="download-now__stat-value">
                        {lastPacket.numPeers}
                      </span>
                    </span>
                  </div>
                </div>
              )}

            {lastPacket?.batchFilesTotal != null &&
              lastPacket.batchFilesTotal > 1 && (
                <div className="download-now__stat">
                  <span style={{ color: dominantColor, display: "flex" }}>
                    <FileIcon size={16} />
                  </span>
                  <div className="download-now__stat-content">
                    <span className="download-now__stat-label">
                      {t("files")}:
                    </span>
                    <span className="download-now__stat-value">
                      {lastPacket.batchFilesDownloaded ?? 0}/
                      {lastPacket.batchFilesTotal}
                    </span>
                  </div>
                </div>
              )}

            {game.download?.downloader !== undefined && (
              <div className="download-now__stat">
                <div className="download-now__stat-content">
                  <Badge>
                    {DOWNLOADER_NAME[Number(game.download.downloader)]}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <div className="download-now__chart">
            <SpeedChart
              speeds={speedHistory}
              peakSpeed={peakSpeed}
              color={dominantColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
