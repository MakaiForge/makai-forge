import { Button } from "@renderer/components";
import { useTranslation } from "react-i18next";
import "./version-list.scss";

interface VersionListProps {
  versions: Array<{
    tag_name: string;
    published_at: string;
  }>;
  isInstalled: (version: string) => boolean;
  onDownload: (version: any) => void;
  onSelectVersion: (version: any) => void;
  onOpenFolder: (version: string) => void;
  downloading?: { version: string; percent: number } | null;
  selectedVersion?: string;
  showInfoButton?: boolean;
  onInfo?: (version: any) => void;
}

export function VersionList({
  versions,
  isInstalled,
  onDownload,
  onSelectVersion,
  onOpenFolder,
  downloading,
  selectedVersion,
  showInfoButton = false,
  onInfo,
}: VersionListProps) {
  const { t } = useTranslation("proton_tools");
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="version-list">
      {versions.map((release) => {
        const installed = isInstalled(release.tag_name);
        const isDownloading = downloading?.version === release.tag_name;
        const isSelected = selectedVersion === release.tag_name;

        return (
          <div
            key={release.tag_name}
            className={`version-list__item ${installed ? "installed" : ""} ${isSelected ? "selected" : ""}`}
            onClick={(e) => { e.stopPropagation(); onSelectVersion(release); }}
          >
            <div className="version-list__left">
              <span className="version-list__name">{release.tag_name}</span>
              <span className="version-list__date">
                {formatDate(release.published_at)}
              </span>
            </div>
            <div className="version-list__right">
              {installed && (
                <Button
                  className="folder-btn"
                  onClick={(e) => { e.stopPropagation(); onOpenFolder(release.tag_name); }}
                  title={t("open_folder")}
                >
                  📂
                </Button>
              )}
              {showInfoButton && onInfo && (
                <Button
                  className="info-btn"
                  onClick={(e) => { e.stopPropagation(); onInfo(release); }}
                  title={t("info")}
                >
                  ℹ️
                </Button>
              )}
              <Button
                className={`download-btn ${installed ? "installed" : ""}`}
                onClick={(e) => { e.stopPropagation(); onDownload(release); }}
                disabled={isDownloading}
              >
                {isDownloading
                  ? `${downloading.percent}%`
                  : installed
                    ? "✓"
                    : "⬇"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
