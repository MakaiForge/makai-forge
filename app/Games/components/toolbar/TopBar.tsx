import { GamesToolbar } from "./Toolbar";
import type { ViewMode, SortOption } from "../../types";
import "./toolbar.scss";

interface Props {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showHiddenGames: boolean;
  onToggleHidden: () => void;
  hasHiddenGames: boolean;
  showModCompatible: boolean;
  onToggleModCompatible: () => void;
  onAddGame: () => void;
  onBackupClick: () => Promise<void>;
  handleSyncSteam: () => Promise<void>;
  syncing: boolean;
  syncLabel: string;
}

export function GamesTopBar({
  searchQuery, onSearchChange, viewMode, onViewModeChange,
  sortBy, onSortChange, showHiddenGames, onToggleHidden, hasHiddenGames,
  showModCompatible, onToggleModCompatible, onAddGame, onBackupClick,
  handleSyncSteam, syncing, syncLabel,
}: Props) {
  return (
    <div className="games__topbar">
      <div className="games__topbar-left">
        <h1 className="games__title">Meus Jogos</h1>
        <span className="games__divider" />
        <GamesToolbar
          searchQuery={searchQuery} onSearchChange={onSearchChange}
          viewMode={viewMode} onViewModeChange={onViewModeChange}
          sortBy={sortBy} onSortChange={onSortChange}
          showHiddenGames={showHiddenGames} onToggleHidden={onToggleHidden} hasHiddenGames={hasHiddenGames}
          onAddGame={onAddGame}
          showModCompatible={showModCompatible} onToggleModCompatible={onToggleModCompatible}
        />
      </div>
      <button className="games__backup-btn" onClick={onBackupClick}>
        <span className="games__backup-icon">☁</span>Backup e Sincronizar
      </button>
      <button className="games__sync-btn" onClick={handleSyncSteam} disabled={syncing}>
        <span className={`games__sync-icon ${syncing ? "games__sync-icon--spin" : ""}`}>↻</span>
        {syncLabel}
      </button>
    </div>
  );
}
