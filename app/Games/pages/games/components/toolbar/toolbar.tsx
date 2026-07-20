import { TextField } from "@renderer/components";
import type { ViewMode, SortOption } from "../../shared/types";
import "./toolbar.scss";

interface GamesToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showHiddenGames: boolean;
  onToggleHidden: () => void;
  hasHiddenGames: boolean;
  onAddGame: () => void;
  showModCompatible?: boolean;
  onToggleModCompatible?: () => void;
}

export function GamesToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  showHiddenGames,
  onToggleHidden,
  hasHiddenGames,
  onAddGame,
  showModCompatible,
  onToggleModCompatible,
}: GamesToolbarProps) {
  return (
    <div className="games__toolbar">
      <TextField
        placeholder="Buscar jogos..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="games__toolbar-group">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="games__toolbar-select"
        >
          <option value="title_asc">A-Z</option>
          <option value="title_desc">Z-A</option>
          <option value="recently_played">Recentes</option>
          <option value="most_played">Mais jogados</option>
          <option value="installed_first">Instalados</option>
        </select>

        <div className="games__toolbar-view">
          <button
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => onViewModeChange("grid")}
            title="Cards (padrão)"
          >
            ▦
          </button>
          <button
            className={viewMode === "compact" ? "active" : ""}
            onClick={() => onViewModeChange("compact")}
            title="Compacto"
          >
            ☰
          </button>
          <button
            className={viewMode === "large" ? "active" : ""}
            onClick={() => onViewModeChange("large")}
            title="Grande (detalhado)"
          >
            ⊞
          </button>
        </div>

        {hasHiddenGames && (
          <button
            className={`games__toolbar-hide ${showHiddenGames ? "" : "active"}`}
            onClick={onToggleHidden}
            title={showHiddenGames ? "Mostrar ativos" : "Mostrar ocultos"}
          >
            {showHiddenGames ? "🙈" : "👁"}
          </button>
        )}

        {onToggleModCompatible && (
          <button
            className={`games__toolbar-filter ${showModCompatible ? "active" : ""}`}
            onClick={onToggleModCompatible}
            title={showModCompatible ? "Mostrando apenas jogos compatíveis com mods" : "Mostrando todos os jogos"}
          >
            🎮{showModCompatible ? "" : " *"}
          </button>
        )}

        <button className="games__toolbar-add" onClick={onAddGame}>
          + Adicionar
        </button>
      </div>
    </div>
  );
}
