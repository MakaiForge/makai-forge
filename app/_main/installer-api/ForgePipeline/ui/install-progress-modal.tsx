import { useTranslation } from "react-i18next";
import { Modal } from "@components";
import { ProgressBar } from "@components/progress-bar";
import { useEffect, useRef, useState, useCallback } from "react";

import "./install-progress-modal.scss";

export interface InstallProgress {
  status: string;
  percent: number;
  gameTitle?: string;
}

const STATUS_ORDER = [
  "preparing",
  "download",
  "extract",
  "prefix",
  "dlls",
  "launch",
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
  const logRef = useRef<HTMLPreElement>(null);

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
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

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

  const getStepStatus = (idx: number) => {
    if (idx < currentStepIdx) return "completed";
    if (idx === currentStepIdx) {
      if (isComplete) return "completed";
      if (isError) return "error";
      return "active";
    }
    return "pending";
  };

  const stepLabel = (key: string) => {
    if (key === "download" && progress.status === "download") {
      return t("step_download", { protonName: "" });
    }
    return t(`step_${key}`);
  };

  return (
    <Modal
      visible={visible}
      title={t("title", { gameTitle: progress.gameTitle ?? "" })}
      onClose={handleClose}
      clickOutsideToClose={!installing}
      large
    >
      <div className="install-progress-modal">
        {installing && (
          <p className="install-progress-modal__wait-text">
            {t("please_wait")}
          </p>
        )}

        <div className="install-progress-modal__bar">
          <ProgressBar value={progress.percent} />
          <span className="install-progress-modal__percent">
            {progress.percent}%
          </span>
        </div>

        <ul className="install-progress-modal__steps">
          {STATUS_ORDER.map((key, idx) => {
            const status = getStepStatus(idx);
            return (
              <li
                key={key}
                className={`install-progress-modal__step install-progress-modal__step--${status}`}
              >
                <span className="install-progress-modal__step-icon">
                  {status === "completed" && "✓"}
                  {status === "active" && "⟳"}
                  {status === "pending" && "○"}
                  {status === "error" && "✕"}
                </span>
                <span className="install-progress-modal__step-label">
                  {stepLabel(key)}
                </span>
              </li>
            );
          })}
        </ul>

        {installing && progress?.status === "launch" && (
          <p className="install-progress-modal__hint-text">
            {t("hint_close_launcher")}
          </p>
        )}

        <pre ref={logRef} className="install-progress-modal__terminal">
          {logLines.map((line, i) => (
            <code key={i}>{line}{"\n"}</code>
          ))}
        </pre>

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
