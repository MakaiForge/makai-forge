interface Props {
  status: string;
  progress: number;
}

export function BrowserSetupScreen({ status, progress }: Props) {
  return (
    <div className="browser-view__setup">
      <div className="browser-view__setup-content">
        <div className="browser-view__setup-spinner" />
        <p className="browser-view__setup-status">{status}</p>
        <div className="browser-view__setup-bar">
          <div className="browser-view__setup-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="browser-view__setup-pct">{progress}%</span>
      </div>
    </div>
  );
}
