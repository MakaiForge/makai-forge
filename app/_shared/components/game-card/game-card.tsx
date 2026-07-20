import { DownloadIcon, PeopleIcon, StarFillIcon } from "@primer/octicons-react";
import type { ShopAssets } from "@types";

import SteamLogo from "@renderer/assets/steam-logo.svg?react";

import "./game-card.scss";

import { useTranslation } from "react-i18next";
import { Badge } from "../badge/badge";

export interface GameCardProps
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  game: ShopAssets;
}

const shopIcon = {
  steam: <SteamLogo className="game-card__shop-icon" />,
};

export function GameCard({ game, ...props }: GameCardProps) {
  const { t } = useTranslation("game_card");

  return (
    <button {...props} type="button" className="game-card">
      <div className="game-card__backdrop">
        <img
          src={game.libraryImageUrl ?? undefined}
          alt={game.title}
          className="game-card__cover"
          loading="lazy"
        />

        <div className="game-card__content">
          <div className="game-card__title-container">
            {shopIcon[game.shop]}
            <p className="game-card__title">{game.title}</p>
          </div>

          {game.downloadSources?.length ? (
            <ul className="game-card__download-options">
              {game.downloadSources.slice(0, 3).map((sourceName) => (
                <li key={sourceName}>
                  <Badge>{sourceName}</Badge>
                </li>
              ))}
              {game.downloadSources.length > 3 && (
                <li>
                  <Badge>
                    +{game.downloadSources.length - 3}{" "}
                    {t("game_card:available", {
                      count: game.downloadSources.length - 3,
                    })}
                  </Badge>
                </li>
              )}
            </ul>
          ) : (
            <p className="game-card__no-download-label">{t("no_downloads")}</p>
          )}

          <div className="game-card__specifics">
            <div className="game-card__specifics-item">
              <DownloadIcon />
              <span>…</span>
            </div>
            <div className="game-card__specifics-item">
              <PeopleIcon />
              <span>…</span>
            </div>
            <div className="game-card__specifics-item">
              <StarFillIcon size={14} />
              <span>…</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
