import { useState, useCallback } from "react";
import { useDeferredValue } from "react";
import { LibraryGame } from "@types";
import { ViewMode, SortOption } from "@renderer/pages/games/games-types";
import type { GameConfig } from "../components/modals/add-game/games-service";
import { SORT_OPTIONS } from "../utils/games-utils";

interface DllCheckModal {
  open: boolean;
  loading: boolean;
  result: { installed: string[]; errors: string[] } | null;
}

interface GameContextMenu {
  game: GameConfig | null;
  visible: boolean;
  position: { x: number; y: number };
}

export interface GameUIState {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  deferredSearchQuery: string;
  viewMode: ViewMode;
  sortBy: SortOption;
  showAddModal: boolean;
  setShowAddModal: (v: boolean) => void;
  showConfigModal: boolean;
  setShowConfigModal: (v: boolean) => void;
  showDeleteModal: boolean;
  setShowDeleteModal: (v: boolean) => void;
  showBackupModal: boolean;
  setShowBackupModal: (v: boolean) => void;
  showBackupPanel: boolean;
  setShowBackupPanel: (v: boolean) => void;
  backupProvider: string | null;
  setBackupProvider: (v: string | null) => void;
  dllCheckModal: DllCheckModal;
  setDllCheckModal: (v: DllCheckModal) => void;
  erroredImages: Set<string>;
  clearingPrefix: boolean;
  setClearingPrefix: (v: boolean | ((prev: boolean) => boolean)) => void;
  gameContextMenu: GameContextMenu;
  setGameContextMenu: (v: GameContextMenu | ((prev: GameContextMenu) => GameContextMenu)) => void;
  handleImageError: (id: string) => void;
  handleViewModeChange: (mode: ViewMode) => void;
  handleSortChange: (sort: SortOption) => void;
  handleOpenContextMenu: (game: LibraryGame, pos: { x: number; y: number }) => void;
  handleCloseContextMenu: () => void;
}

export function useGameUIState(): GameUIState {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("games-view-mode");
    return (saved as ViewMode) || "grid";
  });

  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem("games-sort-by");
    if (saved && SORT_OPTIONS.includes(saved as SortOption)) return saved as SortOption;
    return "title_asc";
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showBackupPanel, setShowBackupPanel] = useState(false);
  const [backupProvider, setBackupProvider] = useState<string | null>(null);

  const [dllCheckModal, setDllCheckModal] = useState<DllCheckModal>({
    open: false, loading: false, result: null,
  });

  const [erroredImages, setErroredImages] = useState<Set<string>>(new Set());
  const [clearingPrefix, setClearingPrefix] = useState(false);

  const [gameContextMenu, setGameContextMenu] = useState<GameContextMenu>({
    game: null, visible: false, position: { x: 0, y: 0 },
  });

  const handleImageError = useCallback((gameId: string) => {
    setErroredImages((prev) => new Set(prev).add(gameId));
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("games-view-mode", mode);
  }, []);

  const handleSortChange = useCallback((nextSortBy: SortOption) => {
    setSortBy(nextSortBy);
    localStorage.setItem("games-sort-by", nextSortBy);
  }, []);

  const handleOpenContextMenu = useCallback(
    (game: LibraryGame, position: { x: number; y: number }) => {
      setGameContextMenu({
        game: game as unknown as GameConfig,
        visible: true,
        position,
      });
    },
    []
  );

  const handleCloseContextMenu = useCallback(() => {
    setGameContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    searchQuery, setSearchQuery, deferredSearchQuery,
    viewMode, sortBy,
    showAddModal, setShowAddModal,
    showConfigModal, setShowConfigModal,
    showDeleteModal, setShowDeleteModal,
    showBackupModal, setShowBackupModal,
    showBackupPanel, setShowBackupPanel,
    backupProvider, setBackupProvider,
    dllCheckModal, setDllCheckModal,
    erroredImages, clearingPrefix, setClearingPrefix,
    gameContextMenu, setGameContextMenu,
    handleImageError,
    handleViewModeChange, handleSortChange,
    handleOpenContextMenu, handleCloseContextMenu,
  };
}
