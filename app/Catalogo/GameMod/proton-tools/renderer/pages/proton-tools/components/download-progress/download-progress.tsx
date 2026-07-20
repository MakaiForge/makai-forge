import { useTranslation } from "react-i18next";
import { ProgressBar } from "@renderer/components/progress-bar";
import type { DownloadState } from "../../types";
import "./download-progress.scss";

interface DownloadProgressProps {
  downloads: DownloadState[];
}

const STATUS_KEYS = new Set(["extracting", "verifying", "adjusting_dir", "done", "done_warning", "queued"]);

function statusText(dl: DownloadState, t: (key: string) => string): string {
  if (dl.percent === 100 && dl.speed === "done") return "\u2713 " + t("done");
  if (dl.percent === 100 && dl.speed === "done_warning") return "\u2713 " + t("done_warning");
  if (!dl.speed) return t("download_speed");
  if (STATUS_KEYS.has(dl.speed)) return t(dl.speed);
  return dl.speed;
}

export function DownloadProgress({ downloads }: DownloadProgressProps) {
  const { t } = useTranslation("proton_tools");

  if (downloads.length === 0) {
    return <div className="download-progress__empty">{t("no_active")}</div>;
  }

  return (
    <div className="download-progress">
      {downloads.map((dl) => (
        <div key={`${dl.toolId}-${dl.version}`} className="download-progress__item">
          <div className="download-progress__header">
            <span className="download-progress__label">{t("downloading_title")}:</span>
            <span className="download-progress__tool">{dl.toolId}</span>
            <span className="download-progress__version">{dl.version}</span>
          </div>
          <div className="download-progress__bar">
            <ProgressBar value={dl.percent} />
            <span className="download-progress__percent">{dl.percent}%</span>
          </div>
          <div className="download-progress__footer">
            <span className={`download-progress__speed ${dl.speed && STATUS_KEYS.has(dl.speed) && dl.percent < 100 ? "download-progress__speed--status" : ""} ${dl.percent === 100 ? "download-progress__speed--done" : ""}`}>
              {statusText(dl, t)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
