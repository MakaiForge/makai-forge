import { useTranslation } from "react-i18next";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PlayIcon,
  DownloadIcon,
  HeartIcon,
  HeartFillIcon,
  CheckCircleFillIcon,
  GearIcon,
  PencilIcon,
  FileDirectoryIcon,
  LinkIcon,
  TrashIcon,
  XIcon,
  SearchIcon,
} from "@primer/octicons-react";
import SteamLogo from "@renderer/assets/steam-logo.svg?react";
import { LibraryGame } from "@types";
import {
  ContextMenu,
  ContextMenuItemData,
  ContextMenuProps,
  useGameActions,
} from "..";
import { DeleteGameModal } from "@games-ui/pages/games/components/delete-game-modal";
import { useGameCollections, useToast, useUserDetails } from "@renderer/hooks";

interface GameContextMenuProps extends Omit<ContextMenuProps, "items"> {
  game: LibraryGame;
  isCustomGame?: boolean;
  onOpenWineConfig?: () => void;
}

const getGameCollectionIds = (currentGame: LibraryGame): string[] => {
  if (Array.isArray(currentGame.collectionIds)) {
    return currentGame.collectionIds;
  }

  const legacyCollectionId = (currentGame as { collectionId?: string | null })
    .collectionId;

  return legacyCollectionId ? [legacyCollectionId] : [];
};

const FAVORITES_COLLECTION_ID = "__favorites__";

export function GameContextMenu({
  game,
  visible,
  position,
  onClose,
  isCustomGame = false,
  onOpenWineConfig,
}: GameContextMenuProps) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();
  const { userDetails } = useUserDetails();
  const [searchParams] = useSearchParams();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDeleteFromLibrary = useCallback(async () => {
    setShowDeleteModal(false);
    onClose();
    try {
      if (game.download?.downloader && game.download.progress !== 1) {
        await window.electron.cancelGameDownload(game.shop, game.objectId);
      }
      await window.electron.deleteGameCompletely(game.shop, game.objectId);
      window.dispatchEvent(new CustomEvent("protonforge:game-removed-from-library"));
    } catch (e) {
      void e;
    }
  }, [game, onClose]);

  const handleDeleteGameAndPrefix = useCallback(async () => {
    setShowDeleteModal(false);
    onClose();
    try {
      if (game.download?.downloader && game.download.progress !== 1) {
        await window.electron.cancelGameDownload(game.shop, game.objectId);
      }
      await window.electron.deleteGameWithPrefix(game.shop, game.objectId);
      window.dispatchEvent(new CustomEvent("protonforge:game-removed-from-library"));
    } catch (e) {
      void e;
    }
  }, [game, onClose]);

  const [localCollectionIds, setLocalCollectionIds] = useState<string[]>(() =>
    getGameCollectionIds(game)
  );
  const [isFavoriteSelected, setIsFavoriteSelected] = useState(
    Boolean(game.favorite)
  );
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(
    null
  );
  const [isFavoritePending, setIsFavoritePending] = useState(false);
  const [favoriteSuccessVisible, setFavoriteSuccessVisible] = useState(false);
  const [collectionSuccessId, setCollectionSuccessId] = useState<string | null>(
    null
  );
  const {
    collections,
    isLoading: isCollectionsLoading,
    loadCollections,
    assignGameToCollection,
  } = useGameCollections();
  const {
    canPlay,
    isDeleting,
    isGameDownloading,
    isGameRunning,
    hasRepacks,
    creatingShortcut,
    creatingSteamShortcut,
    handlePlayGame,
    handleCloseGame,
    handleToggleFavorite,
    handleCreateShortcut,
    handleCreateSteamShortcut,
    handleOpenFolder,
    handleOpenDownloadOptions,
    handleOpenDownloadLocation,
    handleOpenWinePrefix,
    handleCheckDlls,
    handleOpenGameOptions,
  } = useGameActions(game);
  const selectedCollectionId = searchParams.get("collection");

  useEffect(() => {
    if (!visible || game.shop === "custom" || !userDetails) return;
    void loadCollections();
  }, [visible, game.shop, loadCollections, userDetails]);

  useEffect(() => {
    if (!visible) return;

    setLocalCollectionIds(getGameCollectionIds(game));
    setIsFavoriteSelected(Boolean(game.favorite));
    setPendingCollectionId(null);
    setIsFavoritePending(false);
    setFavoriteSuccessVisible(false);
    setCollectionSuccessId(null);
  }, [visible, game]);

  const handleAssignGameCollection = async (collectionId: string) => {
    if (pendingCollectionId || isFavoritePending) return;

    const isCurrentlyAssigned = localCollectionIds.includes(collectionId);
    const nextCollectionIds = isCurrentlyAssigned
      ? localCollectionIds.filter((id) => id !== collectionId)
      : [...localCollectionIds, collectionId];

    setPendingCollectionId(collectionId);

    try {
      await assignGameToCollection(game, nextCollectionIds);

      setLocalCollectionIds(nextCollectionIds);
      if (!isCurrentlyAssigned) {
        setCollectionSuccessId(collectionId);
        window.setTimeout(() => {
          setCollectionSuccessId((currentId) =>
            currentId === collectionId ? null : currentId
          );
        }, 320);
      }

      showSuccessToast(t("game_collection_updated"));

      if (isCurrentlyAssigned && selectedCollectionId === collectionId) {
        onClose();
      }
    } catch (error) {
      void error;
      showErrorToast(t("failed_update_game_collection"));
    } finally {
      setPendingCollectionId(null);
    }
  };

  const handleToggleFavoriteStatus = async () => {
    if (isFavoritePending || pendingCollectionId) return;

    const isAddingToFavorites = !isFavoriteSelected;

    setIsFavoritePending(true);

    try {
      await handleToggleFavorite(isFavoriteSelected);

      setIsFavoriteSelected((currentValue) => !currentValue);

      if (isAddingToFavorites) {
        setFavoriteSuccessVisible(true);

        window.setTimeout(() => {
          setFavoriteSuccessVisible(false);
        }, 320);
      }

      if (
        !isAddingToFavorites &&
        selectedCollectionId === FAVORITES_COLLECTION_ID
      ) {
        onClose();
      }
    } catch (error) {
      void error;
    } finally {
      setIsFavoritePending(false);
    }
  };

  const collectionSubmenu: ContextMenuItemData[] = [
    {
      id: "favorite",
      label: t("favorites", { ns: "sidebar" }),
      icon: isFavoriteSelected ? (
        <HeartFillIcon size={16} />
      ) : (
        <HeartIcon size={16} />
      ),
      trailingIcon:
        favoriteSuccessVisible || isFavoriteSelected ? (
          <CheckCircleFillIcon
            size={16}
            className={
              favoriteSuccessVisible ? "context-menu__success-check" : undefined
            }
          />
        ) : undefined,
      onClick: () => {
        void handleToggleFavoriteStatus();
      },
      closeOnClick: false,
      disabled: isDeleting,
    },
    ...(game.shop === "custom"
      ? []
      : collections.map((collection) => ({
          id: `collection-${collection.id}`,
          label: collection.name,
          icon: <FileDirectoryIcon size={16} />,
          trailingIcon: localCollectionIds.includes(collection.id) ? (
            <CheckCircleFillIcon
              size={16}
              className={
                collectionSuccessId === collection.id
                  ? "context-menu__success-check"
                  : undefined
              }
            />
          ) : undefined,
          onClick: () => {
            void handleAssignGameCollection(collection.id);
          },
          closeOnClick: false,
          disabled: isDeleting,
        }))),
  ];

  const items: ContextMenuItemData[] = [
    {
      id: "play",
      label: isGameRunning ? t("close") : canPlay ? t("play") : t("download"),
      icon: isGameRunning ? (
        <XIcon size={16} />
      ) : canPlay ? (
        <PlayIcon size={16} />
      ) : (
        <DownloadIcon size={16} />
      ),
      onClick: () => {
        if (isGameRunning) {
          void handleCloseGame();
        } else if (canPlay) {
          void handlePlayGame();
        } else {
          handleOpenDownloadOptions();
        }
      },
      disabled: isDeleting,
    },
    {
      id: "collection",
      label: t("collection"),
      icon: <FileDirectoryIcon size={16} />,
      onClick: () => {
        if (game.shop === "custom") return;
        void loadCollections();
      },
      disabled: isDeleting || isFavoritePending || Boolean(pendingCollectionId),
      submenu:
        isCollectionsLoading && game.shop !== "custom"
          ? [
              {
                id: "collection-loading",
                label: t("loading"),
                disabled: true,
              },
            ]
          : collectionSubmenu,
    },
    ...(game.executablePath
      ? [
          {
            id: "shortcuts",
            label: t("create_shortcut_simple"),
            icon: <LinkIcon size={16} />,
            disabled: isDeleting,
            submenu: [
              {
                id: "desktop-shortcut",
                label: t("create_shortcut_simple"),
                icon: <LinkIcon size={16} />,
                onClick: handleCreateShortcut,
                disabled: isDeleting || creatingShortcut,
              },
              {
                id: "steam-shortcut",
                label: t("create_steam_shortcut"),
                icon: <SteamLogo style={{ width: 16, height: 16 }} />,
                onClick: handleCreateSteamShortcut,
                disabled: isDeleting || creatingSteamShortcut,
              },
            ],
          },
        ]
      : []),

    ...(isCustomGame
      ? [
          {
            id: "wine-config",
            label: "Configurações do Wine",
            icon: <GearIcon size={16} />,
            disabled: isDeleting,
            onClick: onOpenWineConfig,
          },
          {
            id: "wine-folder",
            label: "Abrir Pasta do Wine",
            icon: <FileDirectoryIcon size={16} />,
            disabled: isDeleting,
            onClick: handleOpenWinePrefix,
          },
          {
            id: "check-dlls",
            label: "Verificar DLLs Faltantes",
            icon: <SearchIcon size={16} />,
            onClick: handleCheckDlls,
            disabled: isDeleting || !game.protonPath,
          },
        ]
      : [
          {
            id: "manage",
            label: t("options"),
            icon: <GearIcon size={16} />,
            disabled: isDeleting,
            submenu: [
              ...(game.executablePath
                ? [
                    {
                      id: "open-folder",
                      label: t("open_folder"),
                      icon: <FileDirectoryIcon size={16} />,
                      onClick: handleOpenFolder,
                      disabled: isDeleting,
                    },
                  ]
                : []),
              ...(game.executablePath
                ? [
                    {
                      id: "download-options",
                      label: t("open_download_options"),
                      icon: <PlayIcon size={16} />,
                      onClick: handleOpenDownloadOptions,
                      disabled: isDeleting || isGameDownloading || !hasRepacks,
                    },
                  ]
                : []),
              ...(game.download?.downloadPath
                ? [
                    {
                      id: "download-location",
                      label: t("open_download_location"),
                      icon: <FileDirectoryIcon size={16} />,
                      onClick: handleOpenDownloadLocation,
                      disabled: isDeleting,
                    },
                  ]
                : []),
              {
                id: "wine-folder",
                label: "Abrir Pasta do Wine",
                icon: <FileDirectoryIcon size={16} />,
                onClick: handleOpenWinePrefix,
                disabled: isDeleting,
              },
            ],
          },
          ...(!isCustomGame
            ? [
                {
                  id: "check-dlls",
                  label: "Verificar DLLs Faltantes",
                  icon: <SearchIcon size={16} />,
                  onClick: handleCheckDlls,
                  disabled: isDeleting || !game.protonPath,
                },
                {
                  id: "properties",
                  label: t("properties"),
                  separator: true,
                  icon: <PencilIcon size={16} />,
                  onClick: () => handleOpenGameOptions(),
                  disabled: isDeleting,
                },
              ]
            : []),
        ]),
    {
      id: "remove",
      label: "Remover",
      icon: <TrashIcon size={16} />,
      disabled: isDeleting,
      danger: true,
      submenu: [
        {
          id: "remove-game",
          label: "Remover Game",
          icon: <TrashIcon size={16} />,
          onClick: () => setShowDeleteModal(true),
          disabled: isDeleting,
          danger: true,
        },
      ],
    },
  ];

  return (
    <>
      <ContextMenu
        items={items}
        visible={visible}
        position={position}
        onClose={onClose}
        className={
          !game.executablePath ? "context-menu--game-not-installed" : undefined
        }
      />

      <DeleteGameModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          onClose();
        }}
        onDeleteGameOnly={handleDeleteFromLibrary}
        onDeleteGameAndPrefix={handleDeleteGameAndPrefix}
        gameTitle={game.title}
      />
    </>
  );
}
