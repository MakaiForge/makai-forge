import { memo, useMemo } from "react";
import { LibraryGame } from "@types";
import { ClockIcon, HeartFillIcon, ImageIcon } from "@primer/octicons-react";
import "./game-card-profile.scss";

interface GameCardProfileProps {
  game: LibraryGame;
  onSelect: () => void;
  onContextMenu: (position: { x: number; y: number }) => void;
}

export const GameCardProfile = memo(function GameCardProfile({
  game,
  onSelect,
  onContextMenu,
}: Readonly<GameCardProfileProps>) {
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
      className="games-card-profile"
      title={game.title}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="games-card-profile__overlay">
        <div className="games-card-profile__top-section">
          <div className="games-card-profile__playtime">
            <ClockIcon size={11} />
            <span>{formatPlayTime(game.playTimeInMilliseconds)}</span>
          </div>
          {game.favorite && (
            <div className="games-card-profile__favorite">
              <HeartFillIcon size={12} />
            </div>
          )}
        </div>
      </div>

      {!activeImageSource ? (
        <div className="games-card-profile__cover-placeholder">
          <ImageIcon size={48} />
        </div>
      ) : (
        <img
          src={activeImageSource}
          alt={game.title}
          className="games-card-profile__game-image"
          loading="lazy"
        />
      )}
    </button>
  );
});
