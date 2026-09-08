import { useState, useEffect } from "react";
import { backupService } from "../services/backup-service";
import { BackupProgressBar } from "./backup-progress";
import "./backup-panel.scss";

interface BackupPanelProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  onLogout: () => void;
  onRestore?: () => void;
}

type PanelView = "menu" | "progress";

interface BackupDetail {
  gameCount: number;
  totalSizeBytes: number;
  timestamp: string;
}

export function BackupPanel({ isOpen, onClose, provider, onLogout, onRestore }: BackupPanelProps) {
  const [view, setView] = useState<PanelView>("menu");
  const [loading, setLoading] = useState(false);
  const [backupExists, setBackupExists] = useState(false);
  const [backupFile, setBackupFile] = useState<{ name: string; sizeBytes: number; lastModified: string } | null>(null);
  const [progress, setProgress] = useState({ percent: 0, status: "" });
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [backupDetail, setBackupDetail] = useState<BackupDetail | null>(null);

  useEffect(() => {
    if (isOpen) {
      setView("menu");
      setError("");
      setResult("");
      setBackupDetail(null);
      setProgress({ percent: 0, status: "" });
      checkBackup();
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubProgress = backupService.onProgress((p) => {
      setProgress(p);
    });

    const unsubError = backupService.onError((e) => {
      setError(e.message);
    });

    return () => {
      unsubProgress();
      unsubError();
    };
  }, []);

  if (!isOpen) return null;

  const checkBackup = async () => {
    const res = await backupService.listFiles();
    if (res.success) {
      setBackupExists(res.exists || false);
      setBackupFile(res.file || null);
    }
  };

  const handleBackup = async () => {
    setView("progress");
    setError("");
    setBackupDetail(null);
    setProgress({ percent: 0, status: "Iniciando backup..." });

    const res = await backupService.startBackup();
    if (res.success) {
      setResult("Backup concluído com sucesso!");
      setBackupDetail({
        gameCount: (res.steamCount || 0) + (res.customCount || 0),
        totalSizeBytes: (res.totalSizeMb || 0) * 1024 * 1024,
        timestamp: res.timestamp || "",
      });
      setBackupExists(true);
    } else {
      setError(res.error || "Falha ao fazer backup");
    }
  };

  const handleRestore = async () => {
    setView("progress");
    setError("");
    setProgress({ percent: 0, status: "Iniciando restauração..." });

    const res = await backupService.restore([]);
    if (res.success) {
      setResult("Restauração concluída com sucesso!");
      onRestore?.();
    } else {
      setError(res.error || "Falha ao restaurar");
    }
  };

  const handleLogout = async () => {
    await backupService.logout();
    onLogout();
    onClose();
  };

  const providerIcon = provider === "dropbox" ? "☁" : "■";
  const providerName = provider === "dropbox" ? "Dropbox" : "AppBox";

  return (
    <div className="backup-panel-overlay" onClick={onClose}>
      <div className="backup-panel" onClick={(e) => e.stopPropagation()}>
        <div className="backup-panel__header">
          <h2>☁ Backup e Sincronizar</h2>
          <button className="backup-panel__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="backup-panel__status">
          <span className="backup-panel__connected">
            {providerIcon} Conectado: {providerName}
          </span>
        </div>

        {error && <div className="backup-panel__error">{error}</div>}

        {view === "menu" && (
          <div className="backup-panel__menu">
            <button className="backup-panel__menu-btn" onClick={handleBackup}>
              💾 Fazer Backup
            </button>
            <button
              className="backup-panel__menu-btn"
              onClick={handleRestore}
              disabled={!backupExists || loading}
            >
              🔄 {backupExists
                ? `Restaurar Backup (${backupFile ? formatSize(backupFile.sizeBytes) : ""})`
                : "Nenhum backup encontrado"}
            </button>
            <button
              className="backup-panel__menu-btn backup-panel__menu-btn--danger"
              onClick={handleLogout}
            >
              🔌 Desconectar Serviço
            </button>
          </div>
        )}

        {view === "progress" && (
          <div className="backup-panel__progress">
            <BackupProgressBar percent={progress.percent} status={progress.status} />
            {backupDetail && (
              <div className="backup-panel__result-detail">
                <div className="backup-panel__result-title">{result}</div>
                <div className="backup-panel__result-stats">
                  <span>🕒 {backupDetail.timestamp}</span>
                  <span>🎮 {backupDetail.gameCount} jogos salvos</span>
                  <span>📊 {formatSize(backupDetail.totalSizeBytes)} total</span>
                </div>
                <button className="backup-panel__menu-btn" onClick={handleBackup}>
                  🔄 Fazer novo backup
                </button>
                <button className="backup-panel__menu-btn" onClick={onClose}>
                  Fechar
                </button>
              </div>
            )}
            {!backupDetail && result && (
              <div className="backup-panel__result">
                <span>{result}</span>
                <button className="backup-panel__menu-btn" onClick={onClose}>
                  Fechar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`;
  return `${kb.toFixed(1)} KB`;
}
