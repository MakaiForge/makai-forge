import { memo, useMemo } from "react";
import { LibraryGame } from "@types";
import { ClockIcon, HeartFillIcon, ImageIcon } from "@primer/octicons-react";
import "./game-card-cover.scss";

interface GameCardCoverProps {
  game: LibraryGame;
  onSelect: () => void;
  onContextMenu: (position: { x: number; y: number }) => void;
}

const normalizePathForCss = (url: string | null | undefined): string => {
  if (!url) return "";
  return url.replaceAll("\\", "/");
};

export const GameCardCover = memo(function GameCardCover({
  game,
  onSelect,
  onContextMenu,
}: Readonly<GameCardCoverProps>) {
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
        game.libraryImageUrl,
        game.coverImageUrl,
        game.libraryHeroImageUrl,
        game.customIconUrl,
        game.iconUrl,
      ].filter((url) => !!url && url.trim() !== ""),
    [game]
  );

  const activeImageSource = imageSources[0] || "";

  const backgroundStyle = useMemo(() => {
    const url = imageSources[0];
    return url ? { backgroundImage: `url("${normalizePathForCss(url)}")` } : {};
  }, [imageSources]);

  return (
    <button
      type="button"
      className="games-card-cover"
      title={game.title}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {!activeImageSource ? (
        <div className="games-card-cover__cover-placeholder">
          <ImageIcon size={48} />
        </div>
      ) : (
        <div className="games-card-cover__background" style={backgroundStyle} />
      )}

      <div className="games-card-cover__gradient" />

      <div className="games-card-cover__overlay">
        <div className="games-card-cover__top-section">
          <div className="games-card-cover__playtime">
            <ClockIcon size={11} />
            <span>{formatPlayTime(game.playTimeInMilliseconds)}</span>
          </div>
          {game.favorite && (
            <div className="games-card-cover__favorite">
              <HeartFillIcon size={14} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
});
