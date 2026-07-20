import type { FileTreeEntry } from "../../../types/mod.types";

interface FileTreeProps {
  entries: FileTreeEntry[];
  excludedFiles?: Set<string>;
  onToggleExclude?: (path: string) => void;
  showCheckboxes?: boolean;
  depth?: number;
}

export function FileTree({ entries, excludedFiles, onToggleExclude, showCheckboxes = true, depth = 0 }: FileTreeProps) {
  return (
    <>
      {entries.map(entry => (
        <div key={entry.path}>
          <div
            className="mod-manager__file-row"
            style={{ paddingLeft: 12 + depth * 16 }}
            onClick={() => !entry.isDirectory && onToggleExclude?.(entry.path)}
          >
            {entry.isDirectory ? (
              <span className="mod-manager__file-icon">📁</span>
            ) : showCheckboxes ? (
              <input
                type="checkbox"
                checked={!excludedFiles?.has(entry.path)}
                onChange={() => onToggleExclude?.(entry.path)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="mod-manager__file-icon">📄</span>
            )}
            <span className={`mod-manager__file-name ${excludedFiles?.has(entry.path) ? "mod-manager__file-name--excluded" : ""}`}>
              {entry.name}
            </span>
          </div>
          {entry.isDirectory && entry.children?.length > 0 && (
            <FileTree
              entries={entry.children}
              excludedFiles={excludedFiles}
              onToggleExclude={onToggleExclude}
              showCheckboxes={showCheckboxes}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}
