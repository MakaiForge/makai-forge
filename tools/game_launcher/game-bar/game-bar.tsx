import { useState, useEffect, useCallback } from "react";
import type { GameConfig } from "@provision/AddGame/games-service";
import { WineToolsMenu } from "./wine-tools-menu/wine-tools-menu";
import { HeartFillIcon, HeartIcon } from "@primer/octicons-react";
import { useClickOutside } from "@renderer/hooks/use-click-outside";
import "./game-bar.scss";

interface GameBarProps {
  game: GameConfig;
  isRunning: boolean;
  clearingPrefix?: boolean;
  onPlay: () => void;
  onConfigure: () => void;
  onStop: () => void;
  onAddToSteam: () => void;
  onRevealFolder: () => void;
  onRevealWinePrefix: () => void;
  onClearPrefix?: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onCreateShortcut?: () => void;
  onHide?: () => void;
  onFavorite?: () => void;
  onWineTricks?: () => void;
  onWineTaskmgr?: () => void;
  onWineControl?: () => void;
  onWineRegedit?: () => void;
  onWineCfg?: () => void;
  onWineConsole?: () => void;
  onWineTerminal?: () => void;
  onWineRunExe?: () => void;
  onWineLog?: () => void;
}

export function GameBar({
  game,
  isRunning,
  clearingPrefix = false,
  onPlay,
  onConfigure,
  onStop,
  onAddToSteam,
  onRevealFolder: _onRevealFolder,
  onRevealWinePrefix,
  onClearPrefix,
  onDelete,
  onDuplicate,
  onCreateShortcut,
  onHide,
  onFavorite,
  onWineTricks,
  onWineTaskmgr,
  onWineControl,
  onWineRegedit,
  onWineCfg,
  onWineConsole,
  onWineTerminal,
  onWineRunExe,
  onWineLog,
}: GameBarProps) {
  const [showPlayMenu, setShowPlayMenu] = useState(false);
  const playMenuRef = useClickOutside(() => setShowPlayMenu(false));

  const handleWineTool = useCallback((id: string) => {
    const map: Record<string, (() => void) | undefined> = {
      winetricks: onWineTricks,
      taskmgr: onWineTaskmgr,
      control: onWineControl,
      regedit: onWineRegedit,
      winecfg: onWineCfg,
      wineconsole: onWineConsole,
      terminal: onWineTerminal,
      runexe: onWineRunExe,
      winelog: onWineLog,
    };
    map[id]?.();
  }, [
    onWineTricks, onWineTaskmgr, onWineControl, onWineRegedit,
    onWineCfg, onWineConsole, onWineTerminal, onWineRunExe, onWineLog,
  ]);

  useEffect(() => {
    setShowPlayMenu(false);
  }, [game]);

  const runnerLabel =
    game.runner === "proton"
      ? "Proton"
      : game.runner === "wine"
        ? "Wine"
        : game.runner === "steam"
          ? "Steam"
          : game.runner;

  return (
    <div className="game-bar">
      <div className="game-bar__container">
        {/* Esquerda: Nome do jogo + ícone */}
        <div className="game-bar__game-info">
          <span className="game-bar__icon">🍷</span>
          <div className="game-bar__text">
            <span className="game-bar__title">{game.title}</span>
            <span className="game-bar__runner">{runnerLabel}</span>
          </div>
        </div>

        {/* Wine Tools - Menu modularizado */}
        <WineToolsMenu
          game={game}
          onWineTool={handleWineTool}
        />

        {/* Botão Configurar - abre configurações do jogo */}
        <div className="game-bar__wine-config">
          <button className="game-bar__wine-button" onClick={onConfigure}>
            Configurar
          </button>
        </div>

        {/* Direita: Play + Menu de opções */}
        <div className="game-bar__play-section">
          <button
            className={`game-bar__play-button ${isRunning ? "game-bar__play-button--running" : ""}`}
            onClick={isRunning ? onStop : onPlay}
          >
            {isRunning ? "STOP" : "PLAY"}
          </button>

          <div className="game-bar__play-menu-wrapper" ref={playMenuRef}>
            <button
              className="game-bar__play-menu-toggle"
              onClick={() => setShowPlayMenu(!showPlayMenu)}
              title="More options"
            >
              ▼
            </button>

            {showPlayMenu && (
              <div className="game-bar__menu">
                <button onClick={onStop}>
                  <span>⏹</span> Stop
                </button>
                <div className="game-bar__menu-divider" />
                <button onClick={onAddToSteam}>
                  <span>🎮</span> Add to Steam
                </button>
                {onCreateShortcut && (
                  <button onClick={onCreateShortcut}>
                    <span>🔗</span> Add to Desktop
                  </button>
                )}
                {onDuplicate && (
                  <button onClick={onDuplicate}>
                    <span>📋</span> Duplicate
                  </button>
                )}
                {onHide && (
                  <button onClick={onHide}>
                    <span>👁</span> {game.isDeleted ? "Show" : "Hide"}
                  </button>
                )}
                {onFavorite && (
                  <button onClick={onFavorite}>
                    <span>
                      {game.favorite ? (
                        <HeartFillIcon size={14} />
                      ) : (
                        <HeartIcon size={14} />
                      )}
                    </span>{" "}
                    {game.favorite
                      ? "Remove from Favorites"
                      : "Add to Favorites"}
                  </button>
                )}
                <button onClick={onRevealWinePrefix}>
                  <span>🍷</span> Abrir Pasta do Wine
                </button>
                {onClearPrefix && (
                  <button onClick={onClearPrefix} disabled={clearingPrefix} className="game-bar__menu-delete">
                    <span>🧹</span> {clearingPrefix ? "Limpando..." : "Limpar Prefixo"}
                  </button>
                )}
                <div className="game-bar__menu-divider" />
                <button onClick={onDelete} className="game-bar__menu-delete">
                  <span>🗑</span> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
