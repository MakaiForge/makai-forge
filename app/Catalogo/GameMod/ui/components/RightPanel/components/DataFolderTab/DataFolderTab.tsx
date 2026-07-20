import { FileTree } from "../../../shared/FileTree/FileTree";
import type { FileTreeEntry } from "../../../../types/mod.types";

interface DataFolderTabProps {
  entries: FileTreeEntry[];
}

export function DataFolderTab({ entries }: DataFolderTabProps) {
  return (
    <div className="mod-manager__data-tab">
      <div className="mod-manager__plugins-header">
        <span>Data Folder</span>
      </div>
      {entries.length === 0 ? (
        <p className="mod-manager__tab-placeholder">No Data folder found. Configure a game first.</p>
      ) : (
        <div className="mod-manager__file-tree">
          <FileTree
            entries={entries}
            showCheckboxes={false}
          />
        </div>
      )}
    </div>
  );
}
