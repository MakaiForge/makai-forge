import SteamLogo from "@renderer/assets/steam-logo.svg?react";
import PlayLogo from "@renderer/assets/play-logo.svg?react";
import { LibraryGame } from "@types";
import cn from "classnames";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { GameContextMenu } from "..";
import { useAppSelector } from "@renderer/hooks";

interface SidebarGameItemProps {
  game: LibraryGame;
  handleSidebarGameClick: (event: React.MouseEvent, game: LibraryGame) => void;
  getGameTitle: (game: LibraryGame) => string;
}

export function SidebarGameItem({
  game,
  handleSidebarGameClick,
  getGameTitle,
}: Readonly<SidebarGameItemProps>) {
  const location = useLocation();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number };
  }>({ visible: false, position: { x: 0, y: 0 } });

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      visible: true,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ visible: false, position: { x: 0, y: 0 } });
  };

  const isCustomGame = game.shop === "custom";
  const sidebarIcon = isCustomGame
    ? game.libraryImageUrl || game.iconUrl
    : game.customIconUrl || game.iconUrl;

  // Determine fallback icon based on game type
  const getFallbackIcon = () => {
    if (isCustomGame) {
      return <PlayLogo className="sidebar__game-icon" />;
    }
    return <SteamLogo className="sidebar__game-icon" />;
  };

  const activeAnimClass = (() => {
    const anim = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-active-animation').trim() ||
                 getComputedStyle(document.documentElement).getPropertyValue('--el-sidebar-active-animation').trim();
    return anim && anim !== 'none' ? `anim--${anim}` : '';
  })();
  const activeStyleClass = (() => {
    const style = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-active-style').trim();
    return style && style !== '' ? `style--${style}` : 'style--gradient';
  })();
  const isActive = location.pathname === `/game/${game.shop}/${game.objectId}`;

  return (
    <>
      <li
        key={game.id}
        className={cn("sidebar__menu-item", {
          "sidebar__menu-item--active": isActive,
          "sidebar__menu-item--muted": game.download?.status === "removed",
          [activeAnimClass]: isActive && !!activeAnimClass,
        })}
      >
        <button
          type="button"
          className={cn("sidebar__menu-item-button", {
            [activeStyleClass]: isActive,
          })}
          onClick={(event) => handleSidebarGameClick(event, game)}
          onContextMenu={handleContextMenu}
        >
          {sidebarIcon ? (
            <img
              className="sidebar__game-icon"
              src={sidebarIcon}
              alt={game.title}
              loading="lazy"
            />
          ) : (
            getFallbackIcon()
          )}

          <span className="sidebar__menu-item-button-label">
            {getGameTitle(game)}
          </span>

          {userPreferences?.enableNewDownloadOptionsBadges !== false &&
            (game.newDownloadOptionsCount ?? 0) > 0 && (
              <span className="sidebar__game-badge">
                +{game.newDownloadOptionsCount}
              </span>
            )}
        </button>
      </li>

      <GameContextMenu
        game={game}
        visible={contextMenu.visible}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
      />
    </>
  );
}
