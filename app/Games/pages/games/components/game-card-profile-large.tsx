import { memo, useMemo } from "react";
import { LibraryGame } from "@types";
import { ClockIcon, HeartFillIcon, ImageIcon } from "@primer/octicons-react";
import "./game-card-profile-large.scss";

interface GameCardProfileLargeProps {
  game: LibraryGame;
  onSelect: () => void;
  onContextMenu: (position: { x: number; y: number }) => void;
}

export const GameCardProfileLarge = memo(function GameCardProfileLarge({
  game,
  onSelect,
  onContextMenu,
}: Readonly<GameCardProfileLargeProps>) {
  const formatPlayTime = (playTimeInMilliseconds = 0): string => {
    const minutes = playTimeInMilliseconds / 60000;
    if (minutes < 60) {
      return `${minutes.toFixed(0)}m`;
    }
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h`;
  };

  const imageSources = useMemo(
    () =>
      [
        game.coverImageUrl,
        game.libraryImageUrl,
        game.customIconUrl,
        game.iconUrl,
      ].filter((url) => !!url && url.trim() !== ""),
    [game]
  );

  const activeImageSource = imageSources[0] || "";

  return (
    <button
      type="button"
      className="games-card-profile-large"
      title={game.title}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="games-card-profile-large__overlay">
        <div className="games-card-profile-large__top-section">
          <div className="games-card-profile-large__playtime">
            <ClockIcon size={11} />
            <span>{formatPlayTime(game.playTimeInMilliseconds)}</span>
          </div>
          {game.favorite && (
            <div className="games-card-profile-large__favorite">
              <HeartFillIcon size={12} />
            </div>
          )}
        </div>
      </div>

      {!activeImageSource ? (
        <div className="games-card-profile-large__cover-placeholder">
          <ImageIcon size={48} />
        </div>
      ) : (
        <img
          src={activeImageSource}
          alt={game.title}
          className="games-card-profile-large__game-image"
          loading="lazy"
        />
      )}
    </button>
  );
});
