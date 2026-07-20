interface ConflictEntry {
  file: string;
  mods: string[];
}

import "./ConflictsModal.scss";

interface ConflictsModalProps {
  open: boolean;
  conflicts: ConflictEntry[];
  onAutoResolve: () => void;
  onClose: () => void;
}

export function ConflictsModal({ open, conflicts, onAutoResolve, onClose }: ConflictsModalProps) {
  if (!open) return null;

  return (
    <div className="conflicts-modal__overlay" onClick={onClose}>
      <div className="conflicts-modal" onClick={e => e.stopPropagation()}>
        <div className="conflicts-modal__header">
          <h3>File Conflicts ({conflicts.length})</h3>
          <button className="conflicts-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="conflicts-modal__body">
          {conflicts.length === 0 ? (
            <p className="conflicts-modal__none">No conflicts detected.</p>
          ) : (
            conflicts.map((c, i) => (
              <div key={i} className="conflicts-modal__entry">
                <span className="conflicts-modal__file">{c.file}</span>
                <span className="conflicts-modal__mods">
                  {c.mods.map((m, j) => (
                    <span key={j} className="conflicts-modal__mod">{m}</span>
                  ))}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="conflicts-modal__footer">
          <button onClick={onClose}>Close</button>
          {conflicts.length > 0 && <button onClick={onAutoResolve}>Auto-Resolve</button>}
        </div>
      </div>
    </div>
  );
}
