import { useTranslation } from "react-i18next";
import { DownloadCard } from "../shared/download-card/download-card";
import type { LibraryGame } from "@types";
import type { GameShop } from "@types";
import "./download-concluido.scss";

interface DownloadConcluidoProps {
  library: LibraryGame[];
  onInstall?: (shop: GameShop, objectId: string) => void;
  onCancel: (shop: GameShop, objectId: string) => void;
  onRemove?: (shop: GameShop, objectId: string, title: string) => void;
}

export function DownloadConcluido({
  library,
  onInstall,
  onCancel,
  onRemove,
}: Readonly<DownloadConcluidoProps>) {
  const { t } = useTranslation("downloads");

  if (!library.length) return null;

  return (
    <div className="download-group">
      <div className="download-group__header">
        <div className="download-group__header-title-group">
          <h2>{t("downloads_completed")}</h2>
          <h3 className="download-group__header-count">{library.length}</h3>
        </div>
      </div>
      <div className="download-group__card-grid">
        {library.map((game) => (
          <DownloadCard
            key={game.id}
            game={game}
            progress={game.download?.progress || 0}
            isPaused={false}
            isCompleted
            onResume={undefined}
            onCancel={onCancel}
            onInstall={onInstall}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
