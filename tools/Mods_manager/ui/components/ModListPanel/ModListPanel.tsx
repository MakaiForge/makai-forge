import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchIcon } from "@primer/octicons-react";
import { ModRow } from "./components/ModRow/ModRow";
import type { ModlistEntry, ModMedia } from "../../types/mod.types";

const ROW_HEIGHT = 32;
const OVERSCAN = 10;

interface ModListPanelProps {
  mods: ModlistEntry[];
  selectedMod: ModlistEntry | null;
  searchQuery: string;
  mediaCache: Record<string, ModMedia>;
  loading: boolean;
  conflicts?: Set<string>;
  conflictDetails?: Record<string, { plugins: string[]; mods: string[] }>;
  searchRef?: React.RefObject<HTMLInputElement | null>;
  onToggle: (index: number) => void;
  onSelect: (mod: ModlistEntry | null) => void;
  onSearch: (query: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onPreview: (mod: ModlistEntry) => void;
  onReadme: (mod: ModlistEntry) => void;
  onLock?: (index: number) => void;
  onAddSeparator?: (index: number) => void;
  onRemoveMod?: (modName: string) => void;
  onDeleteMod?: (modName: string) => void;
  onEslify?: (modName: string) => void;
  onReconfigureFomod?: (modName: string) => void;
  onConflictClick?: (mod: ModlistEntry) => void;
}

export function ModListPanel({
  mods, selectedMod, searchQuery, mediaCache, loading, conflicts,
  conflictDetails, searchRef, onToggle, onSelect, onSearch, onReorder,
  onPreview, onReadme, onLock, onAddSeparator, onRemoveMod, onDeleteMod, onEslify,
  onReconfigureFomod, onConflictClick,
}: ModListPanelProps) {
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (searchQuery
      ? mods.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : mods),
    [mods, searchQuery],
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const handleSelect = useCallback((mod: ModlistEntry) => onSelect(mod), [onSelect]);

  const handleDragStart = useCallback((idx: number) => { dragIdxRef.current = idx; }, []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);
  const handleDrop = useCallback((idx: number) => {
    if (dragIdxRef.current !== null && dragIdxRef.current !== idx) {
      onReorder(dragIdxRef.current, idx);
    }
    dragIdxRef.current = null;
    setDragOverIdx(null);
  }, [onReorder]);
  const handleDragEnd = useCallback(() => {
    dragIdxRef.current = null;
    setDragOverIdx(null);
  }, []);

  return (
    <>
      <div className="mod-manager__search">
        <SearchIcon />
        <input
          ref={searchRef as React.Ref<HTMLInputElement>}
          type="text"
          placeholder="Search mods..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
        />
      </div>

      <div className="mod-manager__modlist-header">
        <div className="mod-manager__header-name">NOME</div>
        <div className="mod-manager__header-center">PREVIEW</div>
        <div className="mod-manager__header-center">LEIA-ME</div>
        <div className="mod-manager__header-center">PRIORIDADE</div>
      </div>

      <div className="mod-manager__modlist" ref={parentRef}>
        {loading ? (
          <div className="mod-manager__loading">Loading mods...</div>
        ) : filtered.length === 0 ? (
          <div className="mod-manager__empty">
            <p>{searchQuery ? `No mods matching "${searchQuery}"` : "No mods installed"}</p>
            <p className="mod-manager__empty-hint">Click Install to add mods.</p>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map(virtualItem => {
              const i = virtualItem.index;
              const mod = filtered[i];
              return (
                <div
                  key={`${mod.name}-${i}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <ModRow
                    mod={mod}
                    index={i}
                    selected={selectedMod?.name === mod.name}
                    dragOver={dragOverIdx === i}
                    media={mediaCache[mod.name] ?? { hasPreview: false, hasReadme: false }}
                    conflicts={conflicts?.has(mod.name)}
                    conflictInfo={conflictDetails?.[mod.name]}
                    onToggle={() => onToggle(i)}
                    onSelect={() => handleSelect(mod)}
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={handleDragEnd}
                    onPreview={() => onPreview(mod)}
                    onReadme={() => onReadme(mod)}
                    onLock={onLock ? () => onLock(i) : undefined}
                    onAddSeparator={onAddSeparator ? () => onAddSeparator(i) : undefined}
                    onRemove={onRemoveMod ? () => onRemoveMod(mod.name) : undefined}
                    onDelete={onDeleteMod ? () => onDeleteMod(mod.name) : undefined}
                    onEslify={onEslify ? () => onEslify(mod.name) : undefined}
                    onReconfigureFomod={onReconfigureFomod ? () => onReconfigureFomod(mod.name) : undefined}
                    onConflictClick={onConflictClick ? () => onConflictClick(mod) : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
