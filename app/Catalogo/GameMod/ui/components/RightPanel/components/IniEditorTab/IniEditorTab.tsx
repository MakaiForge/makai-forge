interface IniEditorTabProps {
  iniFiles: { name: string; path: string; content: string }[];
  selectedIni: string | null;
  iniContent: string;
  onSelect: (path: string, content: string) => void;
  onChange: (content: string) => void;
}

export function IniEditorTab({ iniFiles, selectedIni, iniContent, onSelect, onChange }: IniEditorTabProps) {
  return (
    <div className="mod-manager__ini-tab">
      <div className="mod-manager__plugins-header">
        <span>INI Files</span>
      </div>
      {iniFiles.length === 0 ? (
        <p className="mod-manager__tab-placeholder">No INI files found in profile directory.</p>
      ) : (
        <div className="mod-manager__ini-list">
          {iniFiles.map(f => (
            <div key={f.path}>
              <div
                className={`mod-manager__file-row ${selectedIni === f.path ? "mod-manager__mod-row--selected" : ""}`}
                onClick={() => onSelect(f.path, f.content)}
              >
                <span className="mod-manager__file-icon">📄</span>
                <span className="mod-manager__file-name">{f.name}</span>
              </div>
              {selectedIni === f.path && (
                <textarea
                  className="mod-manager__ini-editor"
                  value={iniContent}
                  onChange={e => onChange(e.target.value)}
                  spellCheck={false}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
