interface StatusBarProps {
  log: string[];
  modsTotal: number;
  modsActive: number;
}

export function StatusBar({ log, modsTotal, modsActive }: StatusBarProps) {
  return (
    <div className="mod-manager__statusbar">
      <div className="mod-manager__statusbar-log">
        {log.length === 0 ? (
          <span className="mod-manager__statusbar-idle">Ready</span>
        ) : (
          log.slice(-50).map((entry, i) => (
            <span key={i} className="mod-manager__statusbar-entry">{entry}</span>
          ))
        )}
      </div>
      <span className="mod-manager__statusbar-info">
        {modsTotal} mods ({modsActive} active)
      </span>
    </div>
  );
}
