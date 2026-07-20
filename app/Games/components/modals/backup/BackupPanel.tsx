import { useState } from "react";
import { Button } from "@renderer/components";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  onLogout: () => void;
  onRestore: () => void;
}

export function BackupPanel({ isOpen, onClose, provider, onLogout, onRestore }: Props) {
  const [backingUp, setBackingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const handleBackupNow = async () => {
    setBackingUp(true);
    setError(null);
    try {
      const result = await window.electron.backupToCloud(provider);
      if (result.success) {
        setLastSync(new Date().toLocaleString());
      } else {
        setError(result.error || "Falha no backup");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao fazer backup");
    }
    setBackingUp(false);
  };

  const handleLogout = async () => {
    await window.electron.disconnectCloudProvider(provider);
    onLogout();
  };

  if (!isOpen) return null;

  return (
    <div className="backup-overlay" onClick={onClose}>
      <div className="backup-panel" onClick={(e) => e.stopPropagation()}>
        <div className="backup-panel__header">
          <h2>Backup - {provider}</h2>
          <button className="backup-panel__close" onClick={onClose}>✕</button>
        </div>
        <div className="backup-panel__body">
          {error && <div className="backup-panel__error">{error}</div>}
          {lastSync && <div className="backup-panel__sync">Último sync: {lastSync}</div>}
        </div>
        <div className="backup-panel__footer">
          <Button variant="danger" onClick={handleLogout}>Desconectar</Button>
          <Button variant="secondary" onClick={onRestore}>Restaurar</Button>
          <Button onClick={handleBackupNow} disabled={backingUp}>
            {backingUp ? "Fazendo backup..." : "Fazer Backup"}
          </Button>
        </div>
      </div>
    </div>
  );
}
