import { useTranslation } from "react-i18next";
import type { InstallResult } from "../../types/install.types";

interface InstallResultOverlayProps {
  result: InstallResult;
  onDismiss: () => void;
}

export function InstallResultOverlay({ result, onDismiss }: InstallResultOverlayProps) {
  const { t } = useTranslation("mod_manager");

  return (
    <div className="install-overlay">
      <div className="install-overlay__box">
        <p className={`install-overlay__title ${result.success ? "install-overlay__title--ok" : "install-overlay__title--err"}`}>
          {result.success ? `✓ ${t("install_complete")}` : `✗ ${t("install_error")}`}
        </p>
        <p className="install-overlay__message">
          {result.success
            ? `"${result.modName}" ${t("install_complete").toLowerCase()}.`
            : result.error}
        </p>
        {result.success && (
          <p className="install-overlay__details">
            {result.extractedFiles.length} {t("files")}
            {result.verified && ` • ${t("verified")}`}
            {result.plugins.length > 0 && ` • ${result.plugins.length} plugins`}
          </p>
        )}
        <button className="install-overlay__btn" onClick={onDismiss}>
          OK
        </button>
      </div>
    </div>
  );
}
