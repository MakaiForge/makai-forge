import { useTranslation } from "react-i18next";
import { Modal } from "@components";
import { ProgressBar } from "@components/progress-bar";
import { useEffect, useState, useCallback } from "react";

import type { InstallProgress } from "./types";
import { StepList } from "./StepList";
import { LogTerminal } from "./LogTerminal";
import "./install-progress-modal.scss";

// Etapas do fluxo de instalação (alinhado com installGame onProgress)
// Portátil: copying → scanning → complete
// Instalador: analyzing → preparing → snapshot → installing → scanning → complete
const STATUS_ORDER = [
  "analyzing",
  "preparing",
  "snapshot",
  "download",
  "copying",
  "installing",
  "scanning",
];

interface InstallProgressModalProps {
  visible: boolean;
  progress: InstallProgress | null;
  onClose: () => void;
}

export function InstallProgressModal({
  visible,
  progress,
  onClose,
}: InstallProgressModalProps) {
  const { t } = useTranslation("install_progress");
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setLogLines([]);
      return;
    }
    const unsub = window.electron.onInstallLog((line: string) => {
      setLogLines((prev) => [...prev, line]);
    });
    return unsub;
  }, [visible]);

  useEffect(() => {
    if (!progress) {
      setCurrentStepIdx(-1);
      return;
    }
    const idx = STATUS_ORDER.indexOf(progress.status);
    if (idx >= 0) {
      setCurrentStepIdx((prev) => Math.max(prev, idx));
    }
  }, [progress]);

  const isComplete = progress?.status === "complete";
  const isError = progress?.status === "error";
  const installing = !isComplete && !isError;

  const handleClose = useCallback(() => {
    if (installing) return;
    onClose();
  }, [installing, onClose]);

  if (!visible || !progress) return null;

  const stepLabel = (key: string) => {
    if (key === "download" && progress.status === "download") {
      return `Baixando Proton — ${progress.gameTitle || ""}`;
    }
    if (key === "analyzing") return "Analisando instalador...";
    if (key === "snapshot") return "Registrando estado do prefixo...";
    if (key === "copying") return "Copiando jogo para o prefixo...";
    if (key === "installing") return "Executando instalador...";
    if (key === "scanning") return "Procurando executáveis...";
    if (key === "complete") return "Instalação concluída!";
    if (key === "error") return "Erro na instalação";
    return t(`step_${key}`);
  };

  return (
    <Modal
      visible={visible}
      title={t("install_progress_title", { gameTitle: progress.gameTitle ?? "" })}
      onClose={handleClose}
      clickOutsideToClose={!installing}
      large
    >
      <div className="install-progress-modal">
        {installing && (
          <p className="install-progress-modal__wait-text">{t("please_wait")}</p>
        )}

        <div className="install-progress-modal__bar">
          <ProgressBar value={progress.percent} />
          <span className="install-progress-modal__percent">
            {progress.percent}%
          </span>
        </div>

        <StepList
          steps={STATUS_ORDER}
          currentStepIdx={currentStepIdx}
          isComplete={isComplete}
          isError={isError}
          stepLabel={stepLabel}
        />

        {installing && progress?.status === "installing" && (
          <p className="install-progress-modal__hint-text">
            O instalador pode abrir em uma janela separada. Aguarde a conclusão.
          </p>
        )}

        <LogTerminal logLines={logLines} />

        {isComplete && (
          <p className="install-progress-modal__complete-text">
            {t("step_complete")}
          </p>
        )}

        {isError && (
          <p className="install-progress-modal__error-text">
            {t("step_error", { error: "" })}
          </p>
        )}

        {!installing && (
          <div className="install-progress-modal__actions">
            <button
              className="install-progress-modal__close-btn"
              onClick={() => navigator.clipboard.writeText(logLines.join("\n"))}
            >
              Copiar Log
            </button>
            <button
              className="install-progress-modal__close-btn"
              onClick={onClose}
            >
              {t("button_close")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
