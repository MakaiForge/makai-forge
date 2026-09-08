import { GameBar } from "@game-launcher/game-bar";
import type { GameConfig } from "../modals/add-game/games-service";
import type { SteamInstalledGame } from "@types";

interface Props {
  activeGame: GameConfig;
  isRunning: boolean;
  clearingPrefix: boolean;
  isSteamActive: boolean;
  selectedSteamGame: SteamInstalledGame | null;
  selectedGame: GameConfig | null;
  onPlaySteam: (game: SteamInstalledGame) => void;
  onPlayLocal: (game: GameConfig) => void;
  onStop: (game: GameConfig) => void;
  onConfigureSteam: (game: SteamInstalledGame) => void;
  onConfigureLocal: (game: GameConfig) => void;
  onAddToSteam: (game: GameConfig) => void;
  onRevealFolder: (game: GameConfig) => void;
  onRevealWinePrefix: (game: GameConfig) => void;
  onOpenExternal: (url: string) => void;
  onClearSteamPrefix: (game: SteamInstalledGame) => void;
  onClearLocalPrefix: (game: GameConfig) => void;
  onDelete: () => void;
  onDuplicate: (game: GameConfig) => void;
  onCreateShortcut: (game: GameConfig) => void;
  onHide: (game: GameConfig) => void;
  onFavoriteSteam: (game: SteamInstalledGame) => void;
  onFavoriteLocal: (game: GameConfig) => void;
  onWineTool: (tool: string) => void;
}

export function GamesGameBar({
  activeGame, isRunning, clearingPrefix, isSteamActive,
  selectedSteamGame, selectedGame, onPlaySteam, onPlayLocal, onStop,
  onConfigureSteam, onConfigureLocal, onAddToSteam, onRevealFolder,
  onRevealWinePrefix, onOpenExternal, onClearSteamPrefix, onClearLocalPrefix,
  onDelete, onDuplicate, onCreateShortcut, onHide, onFavoriteSteam, onFavoriteLocal, onWineTool,
}: Props) {
  const game = activeGame;
  const isSteam = isSteamActive && selectedSteamGame;

  return (
    <GameBar
      game={game}
      isRunning={isRunning}
      clearingPrefix={clearingPrefix}
      onPlay={() => isSteam ? onPlaySteam(selectedSteamGame!) : onPlayLocal(game)}
      onConfigure={() => isSteam ? onConfigureSteam(selectedSteamGame!) : onConfigureLocal(game)}
      onStop={() => onStop(game)}
      onAddToSteam={() => onAddToSteam(game)}
      onRevealFolder={() => onRevealFolder(game)}
      onRevealWinePrefix={() => onRevealWinePrefix(game)}
      onClearPrefix={isSteam ? () => onClearSteamPrefix(selectedSteamGame!) : () => onClearLocalPrefix(game)}
      onDelete={onDelete}
      onDuplicate={() => onDuplicate(game)}
      onCreateShortcut={() => onCreateShortcut(game)}
      onHide={() => onHide(game)}
      onFavorite={isSteam ? () => onFavoriteSteam(selectedSteamGame!) : () => onFavoriteLocal(game)}
      onWineTricks={() => onWineTool("winetricks")}
      onWineTaskmgr={() => onWineTool("taskmgr")}
      onWineControl={() => onWineTool("control")}
      onWineRegedit={() => onWineTool("regedit")}
      onWineCfg={() => onWineTool("winecfg")}
      onWineConsole={() => onWineTool("wineconsole")}
      onWineTerminal={() => onWineTool("terminal")}
      onWineRunExe={() => onWineTool("runexe")}
      onWineLog={() => onWineTool("winelog")}
    />
  );
}
