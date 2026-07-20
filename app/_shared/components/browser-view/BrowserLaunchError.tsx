interface Props {
  error: string;
  onRetry: () => void;
}

export function BrowserLaunchError({ error, onRetry }: Props) {
  return (
    <div className="browser-view__empty">
      <p>Erro ao iniciar navegador</p>
      <span>{error}</span>
      <button className="browser-view__btn" onClick={onRetry} style={{ marginTop: 12, width: "auto", padding: "8px 16px" }}>
        Tentar novamente
      </button>
    </div>
  );
}
