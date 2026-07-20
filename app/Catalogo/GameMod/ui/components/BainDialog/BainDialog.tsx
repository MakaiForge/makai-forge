import "./BainDialog.scss";

interface BainPackage {
  order: number;
  name: string;
  directory: string;
  file_count: number;
}

interface BainDialogProps {
  open: boolean;
  loading: boolean;
  packages: BainPackage[];
  selected: Set<number>;
  installing: boolean;
  error: string | null;
  onToggle: (order: number) => void;
  onInstall: () => void;
  onCancel: () => void;
}

export function BainDialog({
  open, loading, packages, selected, installing, error,
  onToggle, onInstall, onCancel,
}: BainDialogProps) {
  if (!open) return null;
  if (loading) {
    return (
      <div className="bain-dialog__overlay">
        <div className="bain-dialog" onClick={e => e.stopPropagation()}>
          <div className="bain-dialog__body" style={{ textAlign: "center", padding: "40px 16px" }}>
            <p>Detecting BAIN packages...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bain-dialog__overlay" onClick={onCancel}>
      <div className="bain-dialog" onClick={e => e.stopPropagation()}>
        <div className="bain-dialog__header">
          <h3>BAIN Installer</h3>
          <span className="bain-dialog__count">{packages.length} packages</span>
          <button className="bain-dialog__close" onClick={onCancel}>×</button>
        </div>

        {error && <div className="bain-dialog__error">{error}</div>}

        <div className="bain-dialog__body">
          {packages.length === 0 ? (
            <p>No BAIN packages detected.</p>
          ) : (
            packages.map(pkg => (
              <label key={pkg.order} className="bain-dialog__package">
                <input
                  type="checkbox"
                  checked={selected.has(pkg.order)}
                  onChange={() => onToggle(pkg.order)}
                />
                <span className="bain-dialog__pkg-order">[{pkg.order}]</span>
                <span className="bain-dialog__pkg-name">{pkg.name || pkg.directory}</span>
                <span className="bain-dialog__pkg-files">{pkg.file_count} files</span>
              </label>
            ))
          )}
        </div>

        <div className="bain-dialog__footer">
          <span className="bain-dialog__footer-info">
            {selected.size} package(s) selected
          </span>
          <button
            className="bain-dialog__install"
            disabled={installing || selected.size === 0}
            onClick={onInstall}
          >
            {installing ? "Installing..." : "Install Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}
