import { useState } from "react";
import { backupService } from "../services/backup-service";
import "./backup-modal.scss";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (provider: string) => void;
}

const PROVIDERS = [
  { id: "dropbox", name: "Dropbox", icon: "☁", available: true },
  { id: "appbox", name: "AppBox", icon: "■", available: true },
  { id: "pcloud", name: "pCloud", icon: "▲", available: false },
  { id: "onedrive", name: "OneDrive", icon: "◈", available: false },
  { id: "googledrive", name: "Google Drive", icon: "●", available: false },
];

export function BackupModal({ isOpen, onClose, onLoginSuccess }: BackupModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleLogin = async (providerId: string) => {
    setLoading(providerId);
    setError("");

    try {
      const result = await backupService.login(providerId);
      if (result.success) {
        onLoginSuccess(providerId);
        onClose();
      } else {
        setError(result.error || "Falha ao conectar");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="backup-modal-overlay" onClick={onClose}>
      <div className="backup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backup-modal__header">
          <h2>Conectar Serviço de Backup</h2>
          <button className="backup-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="backup-modal__desc">
          Escolha um provedor para salvar seus backups. Você pode conectar
          apenas um provedor por vez.
        </p>

        {error && <div className="backup-modal__error">{error}</div>}

        <div className="backup-modal__list">
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              className={`backup-modal__item ${!p.available ? "backup-modal__item--soon" : ""}`}
            >
              <span className="backup-modal__item-icon">{p.icon}</span>
              <span className="backup-modal__item-name">{p.name}</span>
              {p.available ? (
                <button
                  className="backup-modal__connect-btn"
                  onClick={() => handleLogin(p.id)}
                  disabled={loading === p.id}
                >
                  {loading === p.id ? "Conectando..." : "Conectar"}
                </button>
              ) : (
                <span className="backup-modal__soon">Em breve...</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
