import { DatabaseIcon } from "@primer/octicons-react";
import { formatBytes } from "@shared";
import { steamHeaderUrl } from "../../utils/games-utils";
import type { SteamInstalledGame } from "@types";
import "./cards.scss";

interface Props {
  game: SteamInstalledGame;
  isSelected: boolean;
  isLaunching: boolean;
  hasError: boolean;
  onPlay: () => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onImageError: () => void;
}

export function SteamGridCard({ game, isSelected, isLaunching, hasError, onPlay, onSelect, onContextMenu, onImageError }: Props) {
  return (
    <div
      className={`games__steam-card ${isSelected ? "games__steam-card--selected" : ""} ${isLaunching ? "games__steam-card--launching" : ""}`}
      onClick={onSelect} onDoubleClick={onPlay} onContextMenu={onContextMenu}
    >
      <div className="games__steam-card-img-wrap">
        {!hasError ? (
          <img src={steamHeaderUrl(game.appId)} alt={game.name} className="games__steam-card-img" loading="lazy" onError={onImageError} />
        ) : (
          <div className="games__steam-card-placeholder">{game.name.charAt(0).toUpperCase()}</div>
        )}
        <div className="games__steam-card-overlay">
          <span className="games__steam-card-play-icon">▶</span>
        </div>
      </div>
      <div className="games__steam-card-info">
        <h4 className="games__steam-card-title">{game.name}</h4>
        <div className="games__steam-card-badges">
          <span className="games__steam-card-badge">Steam</span>
          {game.sizeOnDisk > 0 && (
            <span className="games__steam-card-size"><DatabaseIcon size={12} />{formatBytes(game.sizeOnDisk)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
