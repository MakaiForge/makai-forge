import { LibraryGame } from "@types";
import { GameCardProfile } from "./game-card-profile";
import { GameCardProfileLarge } from "./game-card-profile-large";
import { GameCardCover } from "./game-card-cover";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import { ViewMode } from "@renderer/pages/library/view-options";

interface GameCardWrapperProps {
  game: GameConfig;
  viewMode: ViewMode;
  onSelect: (game: GameConfig) => void;
  onContextMenu: (
    game: LibraryGame,
    position: { x: number; y: number }
  ) => void;
}

export function GameCardWrapper({
  game,
  viewMode,
  onSelect,
  onContextMenu,
}: GameCardWrapperProps) {
  const handleClick = () => {
    onSelect(game);
  };

  const handleContextMenu = (position: { x: number; y: number }) => {
    onContextMenu(game as unknown as LibraryGame, position);
  };

  const gameData = game as unknown as LibraryGame;

  if (viewMode === "large") {
    return (
      <GameCardCover
        game={gameData}
        onSelect={handleClick}
        onContextMenu={handleContextMenu}
      />
    );
  }

  if (viewMode === "compact") {
    return (
      <GameCardProfileLarge
        game={gameData}
        onSelect={handleClick}
        onContextMenu={handleContextMenu}
      />
    );
  }

  return (
    <GameCardProfile
      game={gameData}
      onSelect={handleClick}
      onContextMenu={handleContextMenu}
    />
  );
}
