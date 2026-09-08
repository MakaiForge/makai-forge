import { memo, useMemo } from "react";
import { LibraryGame } from "@types";
import { ClockIcon, HeartFillIcon, ImageIcon } from "@primer/octicons-react";
import "./game-card.scss";

interface GameCardProps {
  game: LibraryGame;
  onSelect: () => void;
  onContextMenu: (position: { x: number; y: number }) => void;
  variant?: "profile" | "profile-large" | "cover";
}

export const GameCard = memo(function GameCard({
  game,
  onSelect,
  onContextMenu,
  variant = "profile",
}: Readonly<GameCardProps>) {
  const formatPlayTime = (playTimeInMilliseconds = 0): string => {
    const minutes = playTimeInMilliseconds / 60000;
    if (minutes < 60) {
      return `${minutes.toFixed(0)}m`;
    }
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h`;
  };

  const imagePriority = useMemo(() => {
    if (variant === "cover") {
      return [
        game.libraryImageUrl,
        game.coverImageUrl,
        game.libraryHeroImageUrl,
        game.customIconUrl,
        game.iconUrl,
      ];
    }
    return [
      game.coverImageUrl,
      game.libraryImageUrl,
      game.customIconUrl,
      game.iconUrl,
    ];
  }, [variant, game]);

  const imageSources = useMemo(
    () => imagePriority.filter((url) => !!url && url.trim() !== ""),
    [imagePriority]
  );

  const activeImageSource = imageSources[0] || "";

  const normalizePathForCss = (url: string | null | undefined): string => {
    if (!url) return "";
    return url.replaceAll("\\", "/");
  };

  const backgroundStyle = useMemo(() => {
    const url = imageSources[0];
    if (variant !== "cover") return {};
    return url ? { backgroundImage: `url("${normalizePathForCss(url)}")` } : {};
  }, [imageSources, variant]);

  return (
    <button
      type="button"
      className={`game-card game-card--${variant}`}
      title={game.title}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="game-card__overlay">
        <div className="game-card__top-section">
          <div className="game-card__playtime">
            <ClockIcon size={11} />
            <span>{formatPlayTime(game.playTimeInMilliseconds)}</span>
          </div>
          {game.favorite && (
            <div className="game-card__favorite">
              <HeartFillIcon size={variant === "cover" ? 14 : 12} />
            </div>
          )}
        </div>
      </div>

      {!activeImageSource ? (
        <div className="game-card__placeholder">
          <ImageIcon size={48} />
        </div>
      ) : variant === "cover" ? (
        <>
          <div className="game-card__background" style={backgroundStyle} />
          <div className="game-card__gradient" />
        </>
      ) : (
        <img
          src={activeImageSource}
          alt={game.title}
          className="game-card__image"
          loading="lazy"
        />
      )}
    </button>
  );
});
