import { DatabaseIcon, FileZipIcon } from "@primer/octicons-react";
import { formatBytes } from "@shared";
import { localGameCoverUrl } from "../../utils/games-utils";
import type { GameConfig } from "../modals/add-game/games-service";
import "./cards.scss";

interface Props {
  game: GameConfig;
  isSelected: boolean;
  isLaunching: boolean;
  hasError: boolean;
  onPlay: () => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onImageError: () => void;
}

export function LocalGridCard({ game, isSelected, isLaunching, hasError, onPlay, onSelect, onContextMenu, onImageError }: Props) {
  return (
    <div
      className={`games__steam-card ${isSelected ? "games__steam-card--selected" : ""} ${isLaunching ? "games__steam-card--launching" : ""}`}
      onClick={onSelect} onDoubleClick={onPlay} onContextMenu={onContextMenu}
    >
      <div className="games__steam-card-img-wrap">
        {localGameCoverUrl(game) && !hasError ? (
          <img src={localGameCoverUrl(game)!} alt={game.title} className="games__steam-card-img" loading="lazy" onError={onImageError} />
        ) : (
          <div className="games__steam-card-placeholder">{game.title.charAt(0).toUpperCase()}</div>
        )}
        <div className="games__steam-card-overlay">
          <span className="games__steam-card-play-icon">▶</span>
        </div>
      </div>
      <div className="games__steam-card-info">
        <h4 className="games__steam-card-title">{game.title}</h4>
        <div className="games__steam-card-badges">
          <span className="games__steam-card-badge">Local</span>
          {game.installerSizeInBytes != null && game.installerSizeInBytes > 0 && (
            <span className="games__steam-card-size"><FileZipIcon size={12} />{formatBytes(game.installerSizeInBytes)}</span>
          )}
          {game.installedSizeInBytes != null && game.installedSizeInBytes > 0 && (
            <span className="games__steam-card-size"><DatabaseIcon size={12} />{formatBytes(game.installedSizeInBytes)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
