import { useState, useMemo } from "react";
import { FileTree } from "../../../shared/FileTree/FileTree";
import type { FileTreeEntry } from "../../../../types/mod.types";

interface ModFilesTabProps {
  files: FileTreeEntry[];
  excludedFiles: Set<string>;
  onToggleExclude: (path: string) => void;
  modName: string;
  modStagingDir?: string;
}

function findBSAFiles(entries: FileTreeEntry[], basePath = ""): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = [];
  for (const entry of entries) {
    const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (!entry.isDirectory) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".bsa") || lower.endsWith(".ba2")) {
        result.push({ name: entry.name, path: fullPath });
      }
    }
    if (entry.children) {
      result.push(...findBSAFiles(entry.children, fullPath));
    }
  }
  return result;
}

export function ModFilesTab({ files, excludedFiles, onToggleExclude, modName, modStagingDir }: ModFilesTabProps) {
  const [extracting, setExtracting] = useState(false);
  const [extractLog, setExtractLog] = useState<string[]>([]);

  const bsaFiles = useMemo(() => findBSAFiles(files), [files]);

  const handleExtractAll = async () => {
    if (!modStagingDir) return;
    setExtracting(true);
    setExtractLog([]);
    for (const bsa of bsaFiles) {
      const archivePath = `${modStagingDir}/${bsa.path}`;
      const destDir = `${modStagingDir}/${bsa.name.replace(/\.(bsa|ba2)$/i, "")}_extracted`;
      try {
        const result = bsa.name.toLowerCase().endsWith(".ba2")
          ? await window.electron.ba2Extract(archivePath, destDir)
          : await window.electron.bsaExtract(archivePath, destDir);
        setExtractLog(prev => [...prev, `${result.ok ? "✅" : "❌"} ${bsa.name}: ${result.data?.files?.length || 0} files`]);
      } catch (e) {
        setExtractLog(prev => [...prev, `❌ ${bsa.name}: ${e}`]);
      }
    }
    setExtracting(false);
  };

  return (
    <div className="mod-manager__modfiles-tab">
      <div className="mod-manager__plugins-header">
        <span>Mod Files: {modName}</span>
        {bsaFiles.length > 0 && (
          <button
            className="mod-manager__extract-btn"
            onClick={handleExtractAll}
            disabled={extracting}
          >
            {extracting ? "Extracting..." : `Extract ${bsaFiles.length} BSA/BA2`}
          </button>
        )}
      </div>
      {extractLog.length > 0 && (
        <div className="mod-manager__extract-log">
          {extractLog.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
      {files.length === 0 ? (
        <p className="mod-manager__tab-placeholder">No files found in staging directory.</p>
      ) : (
        <div className="mod-manager__file-tree">
          <FileTree
            entries={files}
            excludedFiles={excludedFiles}
            onToggleExclude={onToggleExclude}
          />
        </div>
      )}
    </div>
  );
}
