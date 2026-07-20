import { DatabaseIcon, FileZipIcon } from "@primer/octicons-react";
import { formatBytes } from "@shared";

interface CompactRowProps {
  thumbnail: string | null;
  title: string;
  runner: string;
  playTimeMs?: number;
  installerSize?: number | null;
  installedSize?: number | null;
  onPlay: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isSelected: boolean;
}

export function GameCompactRow({
  thumbnail,
  title,
  runner,
  playTimeMs,
  installerSize,
  installedSize,
  onPlay,
  onClick,
  onContextMenu,
  isSelected,
}: CompactRowProps) {
  const hours = playTimeMs ? (playTimeMs / 3600000).toFixed(1) : null;

  return (
    <div
      className={`game-compact-row ${isSelected ? "game-compact-row--selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onPlay}
      onContextMenu={onContextMenu}
    >
      <div className="game-compact-row__thumb">
        {thumbnail ? (
          <img src={thumbnail} alt={title} loading="lazy" />
        ) : (
          <div className="game-compact-row__thumb-placeholder">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="game-compact-row__name">{title}</div>

      <span className="game-compact-row__badge">{runner === "steam" ? "Steam" : "Local"}</span>

      {installerSize != null && installerSize > 0 && (
        <span className="game-compact-row__size">
          <FileZipIcon size={12} />
          {formatBytes(installerSize)}
        </span>
      )}

      {installedSize != null && installedSize > 0 && (
        <span className="game-compact-row__size">
          <DatabaseIcon size={12} />
          {formatBytes(installedSize)}
        </span>
      )}

      {hours && <span className="game-compact-row__hours">{hours}h</span>}

      <button
        className="game-compact-row__play"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
      >
        ▶
      </button>
    </div>
  );
}
