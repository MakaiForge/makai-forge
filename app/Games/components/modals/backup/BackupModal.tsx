import { useState } from "react";
import { Button } from "@renderer/components";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (provider: string) => void;
}

export function BackupModal({ isOpen, onClose, onLoginSuccess }: Props) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = [
    { id: "googledrive", label: "Google Drive", icon: "☁️" },
    { id: "onedrive", label: "OneDrive", icon: "☁️" },
    { id: "dropbox", label: "Dropbox", icon: "☁️" },
    { id: "pcloud", label: "pCloud", icon: "☁️" },
  ];

  const handleConnect = async (providerId: string) => {
    setConnecting(providerId);
    setError(null);
    try {
      const result = await window.electron.connectCloudProvider(providerId);
      if (result.success) {
        onLoginSuccess(providerId);
        onClose();
      } else {
        setError(result.error || "Falha ao conectar");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao conectar");
    }
    setConnecting(null);
  };

  if (!isOpen) return null;

  return (
    <div className="backup-overlay" onClick={onClose}>
      <div className="backup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backup-modal__header">
          <h2>Conectar Provedor de Backup</h2>
          <button className="backup-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="backup-modal__body">
          {error && <div className="backup-modal__error">{error}</div>}
          <div className="backup-modal__providers">
            {providers.map((p) => (
              <button key={p.id} className="backup-modal__provider" onClick={() => handleConnect(p.id)} disabled={connecting === p.id}>
                <span>{p.icon}</span>
                <span>{connecting === p.id ? "Conectando..." : p.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="backup-modal__footer">
          <Button onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
