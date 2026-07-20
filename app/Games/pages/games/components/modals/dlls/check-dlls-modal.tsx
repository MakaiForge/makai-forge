import { X, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import "./check-dlls-modal.scss";

interface CheckDllsModalProps {
  isOpen: boolean;
  loading: boolean;
  result: { installed: string[]; errors: string[] } | null;
  onClose: () => void;
}

export function CheckDllsModal({
  isOpen,
  loading,
  result,
  onClose,
}: CheckDllsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="check-dlls-modal-overlay" onClick={onClose}>
      <div
        className="check-dlls-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="check-dlls-modal__header">
          <h2>Verificar DLLs</h2>
          {!loading && (
            <button className="check-dlls-modal__close" onClick={onClose}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="check-dlls-modal-body">
          {loading ? (
            <div className="check-dlls-modal-loading">
              <div className="check-dlls-modal-spinner" />
              <p>Verificando e instalando DLLs necessárias...</p>
              <p className="check-dlls-modal-hint">
                Aguarde enquanto o winetricks configura o prefixo.
              </p>
            </div>
          ) : result ? (
            <div className="check-dlls-modal-result">
              {result.installed.length > 0 && (
                <div className="check-dlls-modal-section">
                  <h3>
                    <CheckCircle size={18} weight="fill" color="#27ae60" />
                    DLLs instaladas
                  </h3>
                  <ul>
                    {result.installed.map((dll) => (
                      <li key={dll}>{dll}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="check-dlls-modal-section">
                  <h3>
                    <WarningCircle size={18} weight="fill" color="#e74c3c" />
                    Erros
                  </h3>
                  <ul>
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.installed.length === 0 && result.errors.length === 0 && (
                <p>Nenhuma DLL necessária para este jogo.</p>
              )}
            </div>
          ) : null}
        </div>

        {!loading && (
          <div className="check-dlls-modal__footer">
            <button className="check-dlls-modal__button" onClick={onClose}>
              OK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
