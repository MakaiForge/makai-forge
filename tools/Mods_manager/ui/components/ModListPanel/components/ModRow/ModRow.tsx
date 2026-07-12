import { useState, useRef, useEffect, useCallback } from "react";
import type { ModlistEntry, ModMedia } from "../../../../types/mod.types";
import "./ModRow.scss";

interface ConflictInfo {
  plugins: string[];
  mods: string[];
}

interface ModRowProps {
  mod: ModlistEntry;
  index: number;
  selected: boolean;
  dragOver: boolean;
  media: ModMedia;
  conflicts?: boolean;
  conflictInfo?: ConflictInfo;
  onToggle: () => void;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onPreview: () => void;
  onReadme: () => void;
  onLock?: () => void;
  onAddSeparator?: () => void;
  onRemove?: () => void;
  onDelete?: () => void;
  onEslify?: () => void;
  onReconfigureFomod?: () => void;
  onConflictClick?: () => void;
}

export function ModRow({
  mod, index, selected, dragOver, media, conflicts, conflictInfo,
  onToggle, onSelect, onDragStart, onDragOver, onDrop, onDragEnd,
  onPreview, onReadme, onLock, onAddSeparator, onRemove, onDelete, onEslify,
  onReconfigureFomod, onConflictClick,
}: ModRowProps) {
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxOpen) return;
    const close = () => setCtxOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ctxOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxPos({ x: e.clientX, y: e.clientY });
    setCtxOpen(true);
  }, []);

  const handleConflictClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onConflictClick?.();
  }, [onConflictClick]);

  const hasEsp = mod.plugins?.some(p => p.toLowerCase().endsWith(".esp"));

  if (mod.isSeparator) {
    return (
      <div
        className="mod-row mod-row--separator"
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
      >
        <span className="mod-row__sep-line" />
        <span className="mod-row__sep-label">{mod.name.replace(/^-+\s*/, "").replace(/\s*-+$/, "")}</span>
        <span className="mod-row__sep-line" />
        {ctxOpen && (
          <div
            ref={ctxRef}
            className="mod-row__ctx"
            style={{ left: ctxPos.x, top: ctxPos.y }}
          >
            <button onClick={() => { setCtxOpen(false); onRemove?.(); }}>Remove Separator</button>
            <button onClick={() => { setCtxOpen(false); onAddSeparator?.(); }}>Add Separator Below</button>
          </div>
        )}
      </div>
    );
  }

  const conflictTooltip = conflicts && conflictInfo
    ? `Conflito: ${conflictInfo.plugins.join(", ")} entre ${conflictInfo.mods.join(", ")}`
    : undefined;

  const cls = [
    "mod-row",
    mod.enabled ? "mod-row--enabled" : "mod-row--disabled",
    selected ? "mod-row--selected" : "",
    dragOver ? "mod-row--drag-over" : "",
    mod.locked ? "mod-row--locked" : "",
    conflicts ? "mod-row--conflict" : "",
    conflicts ? "mod-row--conflict-pulse" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      draggable={!mod.locked || undefined}
      onDragStart={!mod.locked ? onDragStart : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      title={conflictTooltip}
    >
      <div className="mod-row__name">
        {conflicts && (
          <span
            className="mod-row__badge mod-row__badge--clickable"
            title={conflictTooltip}
            onClick={handleConflictClick}
          >
            !
          </span>
        )}
        {mod.locked && <span className="mod-row__lock">🔒</span>}
        {mod.name}
      </div>

      <div
        className={`mod-row__preview ${media.hasPreview ? "" : "mod-row__cell--muted"}`}
        onClick={e => { e.stopPropagation(); if (media.hasPreview) onPreview(); }}
        title="Preview"
      >
        🖼️
      </div>

      <div
        className={`mod-row__readme ${media.hasReadme ? "" : "mod-row__cell--muted"}`}
        onClick={e => { e.stopPropagation(); if (media.hasReadme) onReadme(); }}
        title="Leia-me"
      >
        📖
      </div>

      <div className="mod-row__priority">{mod.priority ?? index}</div>

      {ctxOpen && (
        <div
          ref={ctxRef}
          className="mod-row__ctx"
          style={{ left: ctxPos.x, top: ctxPos.y }}
        >
          <button onClick={() => { setCtxOpen(false); onToggle(); }}>
            {mod.enabled ? "Disable" : "Enable"}
          </button>
          <button onClick={() => { setCtxOpen(false); onLock?.(); }}>
            {mod.locked ? "Unlock" : "Lock"}
          </button>
          <button onClick={() => { setCtxOpen(false); onAddSeparator?.(); }}>
            Add Separator Below
          </button>
          {hasEsp && (
            <button onClick={() => { setCtxOpen(false); onEslify?.(); }}>
              ESLify (convert to ESL)
            </button>
          )}
          {mod.hasFomod && (
            <button onClick={() => { setCtxOpen(false); onReconfigureFomod?.(); }}>
              Reconfigure FOMOD
            </button>
          )}
          <hr className="mod-row__ctx-div" />
          <button className="mod-row__ctx--danger" onClick={() => { setCtxOpen(false); onRemove?.(); }}>
            Remove (keep files)
          </button>
          <button className="mod-row__ctx--danger" onClick={() => { setCtxOpen(false); onDelete?.(); }}>
            Delete (remove files)
          </button>
        </div>
      )}
    </div>
  );
}
