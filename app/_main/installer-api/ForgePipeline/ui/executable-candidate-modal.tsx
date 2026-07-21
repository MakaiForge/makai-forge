import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, SearchIcon } from "@primer/octicons-react";
import { Modal } from "@components";

import "./executable-candidate-modal.scss";

export interface CandidateExe {
  path: string;
  name: string;
  size: number;
}

interface ExecutableCandidateModalProps {
  visible: boolean;
  candidates: CandidateExe[];
  prefixDriveCPath?: string;
  onSelect: (path: string) => void;
  onBrowse: () => void;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getRelativePath(fullPath: string, prefixDriveCPath?: string): string {
  if (!prefixDriveCPath) return fullPath;
  const rel = fullPath.replace(prefixDriveCPath, "");
  return rel.startsWith("/") || rel.startsWith("\\") ? rel.slice(1) : rel;
}

export function ExecutableCandidateModal({
  visible,
  candidates,
  prefixDriveCPath,
  onSelect,
  onBrowse,
  onClose,
}: Readonly<ExecutableCandidateModalProps>) {
  const { t } = useTranslation("downloads");

  return (
    <Modal
      visible={visible}
      title={t("candidate_title")}
      onClose={onClose}
      large
    >
      <div className="executable-candidate-modal">
        <p className="executable-candidate-modal__description">
          {t("candidate_description")}
        </p>

        <div className="executable-candidate-modal__list">
          {candidates.map((exe) => (
            <button
              key={exe.path}
              type="button"
              className="executable-candidate-modal__item"
              onClick={() => onSelect(exe.path)}
            >
              <FileDirectoryIcon size={20} />
              <div className="executable-candidate-modal__info">
                <span className="executable-candidate-modal__name">
                  {exe.name}
                </span>
                <span className="executable-candidate-modal__path">
                  {getRelativePath(exe.path, prefixDriveCPath)}
                </span>
              </div>
              <span className="executable-candidate-modal__size">
                {formatSize(exe.size)}
              </span>
            </button>
          ))}
        </div>

        {candidates.length === 0 && (
          <p className="executable-candidate-modal__empty">
            {t("candidate_empty")}
          </p>
        )}

        <div className="executable-candidate-modal__actions">
          <button
            type="button"
            className="executable-candidate-modal__browse-btn"
            onClick={onBrowse}
          >
            <SearchIcon size={14} />
            <span>{t("candidate_browse")}</span>
          </button>
          <button
            type="button"
            className="executable-candidate-modal__close-btn"
            onClick={onClose}
          >
            {t("candidate_cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
