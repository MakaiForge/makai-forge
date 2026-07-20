import { SteamLogo } from "../cards/icons/SteamLogo";
import { GameCompactRow } from "../cards/GameCompactRow";
import { GameLargeCard } from "../cards/GameLargeCard";
import { steamHeaderUrl, steamImageUrl } from "../../utils/games-utils";
import { SteamGridCard } from "../cards/SteamGridCard";
import type { SteamInstalledGame } from "@types";
import type { ViewMode } from "@renderer/pages/games/games-types";

interface Props {
  games: SteamInstalledGame[];
  viewMode: ViewMode;
  selectedSteamGame: SteamInstalledGame | null;
  launchingGameIds: Set<string>;
  erroredImages: Set<string>;
  onPlay: (game: SteamInstalledGame) => void;
  onSelect: (game: SteamInstalledGame) => void;
  onContextMenu: (game: SteamInstalledGame, pos: { x: number; y: number }) => void;
  onImageError: (id: string) => void;
}

export function GamesSteamSection({
  games,
  viewMode,
  selectedSteamGame,
  launchingGameIds,
  erroredImages,
  onPlay,
  onSelect,
  onContextMenu,
  onImageError,
}: Props) {
  if (games.length === 0) return null;

  return (
    <section className="games__section">
      <div className="games__section-header">
        <span className="games__section-icon"><SteamLogo size={18} /></span>
        <h2 className="games__section-title">Steam</h2>
        <span className="games__section-count">{games.length} jogos</span>
      </div>
      <div className={`games__grid games__grid--${viewMode}`}>
        {games.map((game) =>
          viewMode === "compact" ? (
            <GameCompactRow
              key={game.appId}
              thumbnail={steamHeaderUrl(game.appId)}
              title={game.name}
              runner="steam"
              installedSize={game.sizeOnDisk}
              onPlay={() => onPlay(game)}
              onClick={() => onSelect(game)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(game, { x: e.clientX, y: e.clientY });
              }}
              isSelected={selectedSteamGame?.appId === game.appId}
            />
          ) : viewMode === "large" ? (
            <GameLargeCard
              key={game.appId}
              thumbnail={steamHeaderUrl(game.appId)}
              portraitUrl={steamImageUrl(game.appId)}
              title={game.name}
              runner="steam"
              installedSize={game.sizeOnDisk}
              isSteam appId={game.appId}
              onPlay={() => onPlay(game)}
              onClick={() => onSelect(game)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(game, { x: e.clientX, y: e.clientY });
              }}
              isSelected={selectedSteamGame?.appId === game.appId}
            />
          ) : (
            <SteamGridCard
              key={game.appId}
              game={game}
              isSelected={selectedSteamGame?.appId === game.appId}
              isLaunching={launchingGameIds.has(`steam:${game.appId}`)}
              hasError={erroredImages.has(`steam_${game.appId}`)}
              onPlay={() => onPlay(game)}
              onSelect={() => onSelect(game)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(game, { x: e.clientX, y: e.clientY });
              }}
              onImageError={() => onImageError(`steam_${game.appId}`)}
            />
          )
        )}
      </div>
    </section>
  );
}
