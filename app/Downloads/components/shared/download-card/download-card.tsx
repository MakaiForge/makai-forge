import { useNavigate } from "react-router-dom";
import { buildGameDetailsPath } from "@renderer/helpers";
import { PlayIcon, XCircleIcon, DownloadIcon, TrashIcon, PackageIcon } from "@primer/octicons-react";
import type { GameShop, LibraryGame } from "@types";
import "./download-card.scss";

interface DownloadCardProps {
  game: LibraryGame;
  progress: number;
  isPaused: boolean;
  isCompleted: boolean;
  onResume?: (shop: GameShop, objectId: string) => void;
  onCancel: (shop: GameShop, objectId: string) => void;
  onInstall?: (shop: GameShop, objectId: string) => void;
  onRemove?: (shop: GameShop, objectId: string, title: string) => void;
}

export function DownloadCard({
  game,
  progress,
  isPaused,
  isCompleted,
  onResume,
  onCancel,
  onInstall,
  onRemove,
}: Readonly<DownloadCardProps>) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(buildGameDetailsPath(game));
  };

  const coverUrl = game.libraryImageUrl || "";

  return (
    <div
      className={`download-card${isPaused ? " download-card--paused" : ""}${isCompleted ? " download-card--completed" : ""}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <div className="download-card__cover">
        <img src={coverUrl} alt={game.title} />
      </div>
      <div className="download-card__body">
        <div className="download-card__top">
          <span className="download-card__title">{game.title}</span>
          <div className="download-card__actions">
            {isCompleted && onInstall && (
              <button
                type="button"
                className="download-card__btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onInstall(game.shop, game.objectId);
                }}
                title="Instalar"
              >
                <PackageIcon size={14} />
              </button>
            )}
            {isCompleted && onRemove && (
              <button
                type="button"
                className="download-card__btn download-card__btn--remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(game.shop, game.objectId, game.title);
                }}
                title="Remover"
              >
                <TrashIcon size={14} />
              </button>
            )}
            {isPaused && onResume && (
              <button
                type="button"
                className="download-card__btn download-card__btn--resume"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(game.shop, game.objectId);
                }}
                title="Retomar"
              >
                <PlayIcon size={14} />
              </button>
            )}
            {!isCompleted && (
              <button
                type="button"
                className="download-card__btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(game.shop, game.objectId);
                }}
                title="Cancelar"
              >
                <XCircleIcon size={14} />
              </button>
            )}
          </div>
        </div>
        <span className={`download-card__status${isCompleted ? " download-card__status--done" : ""}`}>
          {isPaused ? "PAUSADO" : isCompleted ? "CONCLUÍDO" : "ATIVO"}
        </span>
        {!isCompleted && progress > 0 && (
          <div className="download-card__progress-track">
            <div
              className="download-card__progress-fill"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
