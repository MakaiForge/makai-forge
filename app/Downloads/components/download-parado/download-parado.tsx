import { useTranslation } from "react-i18next";
import { DownloadCard } from "../shared/download-card/download-card";
import type { LibraryGame } from "@types";
import type { GameShop } from "@types";
import "./download-parado.scss";

interface DownloadParadoProps {
  library: LibraryGame[];
  onResume: (shop: GameShop, objectId: string) => void;
  onCancel: (shop: GameShop, objectId: string) => void;
}

export function DownloadParado({
  library,
  onResume,
  onCancel,
}: Readonly<DownloadParadoProps>) {
  const { t } = useTranslation("downloads");

  if (!library.length) return null;

  return (
    <div className="download-group">
      <div className="download-group__header">
        <div className="download-group__header-title-group">
          <h2>{t("queued_downloads")}</h2>
          <h3 className="download-group__header-count">{library.length}</h3>
        </div>
      </div>
      <div className="download-group__card-grid">
        {library.map((game) => (
          <DownloadCard
            key={game.id}
            game={game}
            progress={game.download?.progress || 0}
            isPaused
            isCompleted={false}
            onResume={onResume}
            onCancel={onCancel}
            onInstall={undefined}
          />
        ))}
      </div>
    </div>
  );
}
