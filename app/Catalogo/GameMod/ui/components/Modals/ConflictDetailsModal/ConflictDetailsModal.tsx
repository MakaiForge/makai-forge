import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./ConflictDetailsModal.scss";

export interface ConflictMod {
  name: string;
  priority: number;
  isWinner: boolean;
}

export interface ConflictFile {
  relativePath: string;
  mods: ConflictMod[];
  type: "plugin" | "script" | "asset";
}

interface ConflictDetailsModalProps {
  open: boolean;
  modName: string;
  conflicts: ConflictFile[];
  onApply: (deselectedMods: string[]) => void;
  onClose: () => void;
}

export function ConflictDetailsModal({
  open,
  modName,
  conflicts,
  onApply,
  onClose,
}: ConflictDetailsModalProps) {
  const { t } = useTranslation("mod_manager");
  const [deselectedMods, setDeselectedMods] = useState<Set<string>>(new Set());

  const handleToggleMod = useCallback((modName: string) => {
    setDeselectedMods(prev => {
      const next = new Set(prev);
      if (next.has(modName)) {
        next.delete(modName);
      } else {
        next.add(modName);
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    onApply(Array.from(deselectedMods));
    setDeselectedMods(new Set());
  }, [deselectedMods, onApply]);

  const handleClose = useCallback(() => {
    setDeselectedMods(new Set());
    onClose();
  }, [onClose]);

  if (!open) return null;

  // Group conflicts by type
  const pluginConflicts = conflicts.filter(c => c.type === "plugin");
  const scriptConflicts = conflicts.filter(c => c.type === "script");
  const assetConflicts = conflicts.filter(c => c.type === "asset");

  // Get unique mods involved in conflicts
  const allMods = new Map<string, { name: string; priority: number }>();
  for (const conflict of conflicts) {
    for (const mod of conflict.mods) {
      if (!allMods.has(mod.name)) {
        allMods.set(mod.name, { name: mod.name, priority: mod.priority });
      }
    }
  }

  return (
    <div className="conflict-details-overlay" onClick={handleClose}>
      <div className="conflict-details-modal" onClick={e => e.stopPropagation()}>
        <div className="conflict-details-modal__header">
          <div className="conflict-details-modal__title">
            <span className="conflict-details-modal__icon">⚠️</span>
            <span>{t("conflict_details_title", { modName })}</span>
          </div>
          <button className="conflict-details-modal__close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="conflict-details-modal__content">
          {conflicts.length === 0 ? (
            <div className="conflict-details-modal__empty">
              {t("no_conflicts_found")}
            </div>
          ) : (
            <>
              {/* Plugin Conflicts */}
              {pluginConflicts.length > 0 && (
                <div className="conflict-details-modal__section">
                  <h3 className="conflict-details-modal__section-title">
                    {t("plugin_conflicts")} ({pluginConflicts.length})
                  </h3>
                  {pluginConflicts.map((conflict, idx) => (
                    <ConflictFileItem
                      key={`plugin-${idx}`}
                      conflict={conflict}
                      deselectedMods={deselectedMods}
                      onToggleMod={handleToggleMod}
                    />
                  ))}
                </div>
              )}

              {/* Script Conflicts */}
              {scriptConflicts.length > 0 && (
                <div className="conflict-details-modal__section">
                  <h3 className="conflict-details-modal__section-title">
                    {t("script_conflicts")} ({scriptConflicts.length})
                  </h3>
                  {scriptConflicts.map((conflict, idx) => (
                    <ConflictFileItem
                      key={`script-${idx}`}
                      conflict={conflict}
                      deselectedMods={deselectedMods}
                      onToggleMod={handleToggleMod}
                    />
                  ))}
                </div>
              )}

              {/* Asset Conflicts */}
              {assetConflicts.length > 0 && (
                <div className="conflict-details-modal__section">
                  <h3 className="conflict-details-modal__section-title">
                    {t("asset_conflicts")} ({assetConflicts.length})
                  </h3>
                  {assetConflicts.map((conflict, idx) => (
                    <ConflictFileItem
                      key={`asset-${idx}`}
                      conflict={conflict}
                      deselectedMods={deselectedMods}
                      onToggleMod={handleToggleMod}
                    />
                  ))}
                </div>
              )}

              {/* Mods Summary */}
              <div className="conflict-details-modal__summary">
                <h4>{t("involved_mods")}</h4>
                <div className="conflict-details-modal__mod-list">
                  {Array.from(allMods.values()).map(mod => (
                    <label
                      key={mod.name}
                      className={`conflict-details-modal__mod-item ${
                        deselectedMods.has(mod.name) ? "conflict-details-modal__mod-item--deselected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!deselectedMods.has(mod.name)}
                        onChange={() => handleToggleMod(mod.name)}
                        className="conflict-details-modal__checkbox"
                      />
                      <span className="conflict-details-modal__mod-name">{mod.name}</span>
                      <span className="conflict-details-modal__mod-priority">
                        {t("priority")}: {mod.priority}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="conflict-details-modal__footer">
          <button className="conflict-details-modal__btn conflict-details-modal__btn--cancel" onClick={handleClose}>
            {t("cancel")}
          </button>
          <button
            className="conflict-details-modal__btn conflict-details-modal__btn--apply"
            onClick={handleApply}
            disabled={conflicts.length === 0}
          >
            {t("apply_resolution")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConflictFileItem({
  conflict,
  deselectedMods,
  onToggleMod,
}: {
  conflict: ConflictFile;
  deselectedMods: Set<string>;
  onToggleMod: (modName: string) => void;
}) {
  const typeIcon = conflict.type === "plugin" ? "📦" : conflict.type === "script" ? "📜" : "📁";

  return (
    <div className="conflict-file-item">
      <div className="conflict-file-item__path">
        <span className="conflict-file-item__icon">{typeIcon}</span>
        <span className="conflict-file-item__name">{conflict.relativePath}</span>
      </div>
      <div className="conflict-file-item__mods">
        {conflict.mods.map(mod => (
          <label
            key={mod.name}
            className={`conflict-file-item__mod ${
              deselectedMods.has(mod.name) ? "conflict-file-item__mod--deselected" : ""
            } ${mod.isWinner ? "conflict-file-item__mod--winner" : ""}`}
          >
            <input
              type="checkbox"
              checked={!deselectedMods.has(mod.name)}
              onChange={() => onToggleMod(mod.name)}
              className="conflict-file-item__checkbox"
            />
            <span className="conflict-file-item__mod-name">{mod.name}</span>
            <span className="conflict-file-item__mod-priority">({mod.priority})</span>
            {mod.isWinner && <span className="conflict-file-item__winner-badge">← WINNER</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
