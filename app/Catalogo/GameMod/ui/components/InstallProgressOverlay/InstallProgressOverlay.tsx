/**
 * InstallProgressOverlay — Overlay de progresso da instalação.
 *
 * Mostra stage atual, progresso, arquivo sendo processado,
 * e botão de cancelar.
 */

import { useTranslation } from "react-i18next";
import type { InstallStage, InstallProgress } from "../../types/install.types";
import "./InstallProgressOverlay.scss";

interface InstallProgressOverlayProps {
  stage: InstallStage;
  progress: InstallProgress | null;
  canCancel: boolean;
  onCancel: () => void;
}

const STAGE_ICONS: Record<InstallStage, string> = {
  idle: "",
  reading_archive: "📖",
  extracting: "📦",
  verifying: "✅",
  analyzing: "🔍",
  saving: "💾",
  ready: "✓",
  error: "❌",
};

export function InstallProgressOverlay({
  stage,
  progress,
  canCancel,
  onCancel,
}: InstallProgressOverlayProps) {
  const { t } = useTranslation("mod_manager");

  if (stage === "idle") return null;

  const percent = progress?.percent ?? 0;
  const modName = progress?.modName || "";
  const currentFile = progress?.currentFile || "";
  const filesProcessed = progress?.filesProcessed ?? 0;
  const filesTotal = progress?.filesTotal ?? 0;

  // Traduzir stage
  const stageKey = `install_stage_${stage}`;
  const stageLabel = t(stageKey, stage);

  // Truncar nome do arquivo se muito longo
  const displayFile = currentFile.length > 40
    ? `...${currentFile.slice(-37)}`
    : currentFile;

  return (
    <div className="install-overlay">
      <div className="install-overlay__box">
        <div className="install-overlay__icon">
          {STAGE_ICONS[stage]}
        </div>

        <p className="install-overlay__title">
          {stage === "ready"
            ? t("install_complete")
            : stage === "error"
              ? t("install_error")
              : t("installing_mod")}
        </p>

        {modName && (
          <p className="install-overlay__modname">{modName}</p>
        )}

        <p className="install-overlay__stage">{stageLabel}</p>

        {currentFile && stage === "extracting" && (
          <p className="install-overlay__file" title={currentFile}>
            {displayFile}
          </p>
        )}

        {filesTotal > 0 && (
          <p className="install-overlay__count">
            {filesProcessed} / {filesTotal} {t("files")}
          </p>
        )}

        <div className="install-overlay__bar-track">
          <div
            className={`install-overlay__bar-fill install-overlay__bar-fill--${stage}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="install-overlay__pct">{Math.round(percent)}%</p>

        {stage === "error" && progress?.message && (
          <p className="install-overlay__error">{progress.message}</p>
        )}

        {canCancel && (
          <button className="install-overlay__cancel" onClick={onCancel}>
            {t("cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
