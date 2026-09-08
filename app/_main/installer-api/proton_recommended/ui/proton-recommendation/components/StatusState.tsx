interface StatusStateProps {
  loading: boolean;
  error: string | null;
}

export function StatusState({ loading, error }: StatusStateProps) {
  if (loading) {
    return (
      <div className="proton-recommendation-modal__loading">Carregando...</div>
    );
  }
  if (error) {
    return <div className="proton-recommendation-modal__error">{error}</div>;
  }
  return null;
}
