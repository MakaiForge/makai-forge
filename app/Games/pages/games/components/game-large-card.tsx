import { useEffect, useState } from "react";
import { DatabaseIcon, FileZipIcon } from "@primer/octicons-react";
import { formatBytes } from "@shared";

interface LargeCardProps {
  thumbnail: string | null;
  portraitUrl: string | null;
  title: string;
  runner: string;
  playTimeMs?: number;
  installerSize?: number | null;
  installedSize?: number | null;
  isSteam?: boolean;
  appId?: string;
  onPlay: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isSelected: boolean;
}

export function GameLargeCard({
  thumbnail,
  portraitUrl,
  title,
  runner,
  playTimeMs,
  installerSize,
  installedSize,
  isSteam,
  appId,
  onPlay,
  onClick,
  onContextMenu,
  isSelected,
}: LargeCardProps) {
  const [details, setDetails] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!isSteam || !appId) return;
    let cancelled = false;
    window.electron
      .getGameShopDetails(appId, "steam", "en")
      .then((data: any) => {
        if (cancelled || !data) return;
        setDetails(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSteam, appId]);

  const year = details?.release_date?.date
    ? details.release_date.date.split(",")[1]?.trim() ||
      details.release_date.date.split("-")[0] ||
      details.release_date.date
    : "";

  const developer = details?.developers?.[0] || "";
  const description = details?.short_description || "";

  const platforms = details?.platforms || {};
  const platformStr = [platforms.windows && "Win", platforms.mac && "Mac", platforms.linux && "Linux"]
    .filter(Boolean)
    .join("/");

  const hours = playTimeMs ? (playTimeMs / 3600000).toFixed(1) : null;

  const imgSrc = portraitUrl || thumbnail;

  return (
    <div
      className={`game-large-card ${isSelected ? "game-large-card--selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onPlay}
      onContextMenu={onContextMenu}
    >
      <div className="game-large-card__art">
        {imgSrc ? (
          <img src={imgSrc} alt={title} loading="lazy" />
        ) : (
          <div className="game-large-card__art-placeholder">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="game-large-card__info">
        <h3 className="game-large-card__title">{title}</h3>

        <div className="game-large-card__meta-row">
          {year && <span className="game-large-card__year">{year}</span>}
          <span className={`game-large-card__badge game-large-card__badge--${runner}`}>
            {runner === "steam" ? "Steam" : "Local"}
          </span>
          {isSteam && platformStr && (
            <span className="game-large-card__platform">{platformStr}</span>
          )}
          {installerSize != null && installerSize > 0 && (
            <span className="game-large-card__size">
              <FileZipIcon size={14} />
              {formatBytes(installerSize)}
            </span>
          )}
          {installedSize != null && installedSize > 0 && (
            <span className="game-large-card__size">
              <DatabaseIcon size={14} />
              {formatBytes(installedSize)}
            </span>
          )}
          {hours && <span className="game-large-card__hours">{hours}h jogadas</span>}
        </div>

        {isSteam && developer && (
          <div className="game-large-card__developer">{developer}</div>
        )}

        {isSteam && description && (
          <p className="game-large-card__desc">{description}</p>
        )}

        <button className="game-large-card__play" onClick={onPlay}>
          ▶ Jogar
        </button>
      </div>
    </div>
  );
}
