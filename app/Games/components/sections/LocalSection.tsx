import { GameCompactRow } from "../cards/GameCompactRow";
import { GameLargeCard } from "../cards/GameLargeCard";
import { localGameCoverUrl } from "../../utils/games-utils";
import { LocalGridCard } from "../cards/LocalGridCard";
import type { GameConfig } from "../modals/add-game/games-service";
import type { ViewMode } from "@renderer/pages/games/games-types";
import type { LibraryGame } from "@types";

interface Props {
  games: GameConfig[];
  viewMode: ViewMode;
  selectedGame: GameConfig | null;
  launchingGameIds: Set<string>;
  erroredImages: Set<string>;
  onPlay: (game: GameConfig) => void;
  onSelect: (game: GameConfig) => void;
  onContextMenu: (game: LibraryGame, pos: { x: number; y: number }) => void;
  onImageError: (id: string) => void;
  title?: string;
}

export function GamesLocalSection({
  games,
  viewMode,
  selectedGame,
  launchingGameIds,
  erroredImages,
  onPlay,
  onSelect,
  onContextMenu,
  onImageError,
  title = "Biblioteca Local",
}: Props) {
  if (games.length === 0) return null;

  return (
    <section className="games__section">
      <div className="games__section-header">
        <h2 className="games__section-title">{title}</h2>
        <span className="games__section-count">{games.length} jogos</span>
      </div>
      <div className={`games__grid games__grid--${viewMode}`}>
        {games.map((game) =>
          viewMode === "compact" ? (
            <GameCompactRow
              key={game.objectId}
              thumbnail={localGameCoverUrl(game)}
              title={game.title}
              runner="local"
              playTimeMs={game.playTimeInMilliseconds}
              installerSize={game.installerSizeInBytes}
              installedSize={game.installedSizeInBytes}
              onPlay={() => onPlay(game)}
              onClick={() => onSelect(game)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(game as any, { x: e.clientX, y: e.clientY });
              }}
              isSelected={selectedGame?.objectId === game.objectId}
            />
          ) : viewMode === "large" ? (
            <GameLargeCard
              key={game.objectId}
              thumbnail={localGameCoverUrl(game)}
              portraitUrl={null}
              title={game.title}
              runner="local"
              playTimeMs={game.playTimeInMilliseconds}
              installerSize={game.installerSizeInBytes}
              installedSize={game.installedSizeInBytes}
              onPlay={() => onPlay(game)}
              onClick={() => onSelect(game)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(game as any, { x: e.clientX, y: e.clientY });
              }}
              isSelected={selectedGame?.objectId === game.objectId}
            />
          ) : (
            <LocalGridCard
              key={game.objectId}
              game={game}
              isSelected={selectedGame?.objectId === game.objectId}
              isLaunching={launchingGameIds.has(`${game.shop}:${game.objectId}`)}
              hasError={erroredImages.has(game.objectId)}
              onPlay={() => onPlay(game)}
              onSelect={() => onSelect(game)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(game as any, { x: e.clientX, y: e.clientY });
              }}
              onImageError={() => onImageError(game.objectId)}
            />
          )
        )}
      </div>
    </section>
  );
}
