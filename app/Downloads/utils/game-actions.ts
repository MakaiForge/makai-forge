import { Downloader } from "@shared";
import type { GameShop, LibraryGame } from "@types";

export interface GameActionItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  show?: boolean;
  iconName: string;
}

export function getGameActions(
  game: LibraryGame,
  isGameDownloading: boolean,
  queuedGameIds: string[],
  isGameSeeding: (game: LibraryGame) => boolean,
  isGameDeleting: (gameId: string) => boolean,
  extractGameDownload: (shop: GameShop, objectId: string) => void,
  pauseSeeding: (shop: GameShop, objectId: string) => void,
  resumeSeeding: (shop: GameShop, objectId: string) => void,
  openDeleteGameModal: (shop: GameShop, objectId: string) => void,
  pauseDownload: (shop: GameShop, objectId: string) => void,
  handleCancelClick: (shop: GameShop, objectId: string) => void,
  resumeDownload: (shop: GameShop, objectId: string) => void,
  handleMoveInQueue: (shop: GameShop, objectId: string, direction: "up" | "down") => void,
  t: (key: string) => string
): GameActionItem[] {
  const deleting = isGameDeleting(game.id);

  if (game.download?.progress === 1) {
    const actions = [
      {
        label: t("extract"),
        disabled: game.download.extracting,
        iconName: "file-directory",
        onClick: () => extractGameDownload(game.shop, game.objectId),
      },
      {
        label: t("stop_seeding"),
        disabled: deleting,
        iconName: "unlink",
        show: isGameSeeding(game) && game.download?.downloader === Downloader.Torrent,
        onClick: () => pauseSeeding(game.shop, game.objectId),
      },
      {
        label: t("resume_seeding"),
        disabled: deleting,
        iconName: "link",
        show: !isGameSeeding(game) && game.download?.downloader === Downloader.Torrent,
        onClick: () => resumeSeeding(game.shop, game.objectId),
      },
      {
        label: t("delete"),
        disabled: deleting,
        iconName: "trash",
        onClick: () => openDeleteGameModal(game.shop, game.objectId),
      },
    ];
    return actions.filter((action) => action.show !== false);
  }

  if (isGameDownloading) {
    return [
      {
        label: t("pause"),
        iconName: "columns",
        onClick: () => pauseDownload(game.shop, game.objectId),
      },
      {
        label: t("cancel"),
        iconName: "x-circle",
        onClick: () => handleCancelClick(game.shop, game.objectId),
      },
    ];
  }

  const queueIndex = queuedGameIds.indexOf(game.id);
  const isFirstInQueue = queueIndex === 0;
  const isLastInQueue = queueIndex === queuedGameIds.length - 1;
  const isInQueue = queueIndex !== -1;

  const actions = [
    {
      label: t("resume"),
      disabled: false,
      iconName: "play",
      onClick: () => resumeDownload(game.shop, game.objectId),
    },
    {
      label: t("move_up"),
      iconName: "arrow-up",
      show: isInQueue && !isFirstInQueue,
      onClick: () => handleMoveInQueue(game.shop, game.objectId, "up"),
    },
    {
      label: t("move_down"),
      iconName: "arrow-down",
      show: isInQueue && !isLastInQueue,
      onClick: () => handleMoveInQueue(game.shop, game.objectId, "down"),
    },
    {
      label: t("cancel"),
      iconName: "x-circle",
      onClick: () => handleCancelClick(game.shop, game.objectId),
    },
  ];

  return actions.filter((action) => action.show !== false);
}
