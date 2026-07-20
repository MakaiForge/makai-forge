import { Modal, Button } from "@components";
import { useState, useEffect } from "react";
import type { InstalledProtonTool, ProtonInfo } from "../../types/proton.types";
import "./ProtonConfigPanel.scss";

interface ProtonConfigPanelProps {
  open: boolean;
  gameId: string | null;
  loading: boolean;
  status: string;
  info: ProtonInfo | null;
  selectedProtonPath: string;
  isConfiguring: boolean;
  setupLog: string[];
  setupSuccess: boolean;
  setupFailed: boolean;
  onClose: () => void;
  onProtonPathChange: (path: string) => void;
  onConfigure: () => void;
}

export function ProtonConfigPanel({
  open, gameId, loading, status, info,
  selectedProtonPath,
  isConfiguring, setupLog, setupSuccess, setupFailed,
  onClose, onProtonPathChange, onConfigure,
}: ProtonConfigPanelProps) {
  const [installedProtons, setInstalledProtons] = useState<InstalledProtonTool[]>([]);
  const [showCustomProton, setShowCustomProton] = useState(false);

  useEffect(() => {
    if (open) {
      window.electron.getInstalledProtonTools().then((result) => {
        setInstalledProtons(result as InstalledProtonTool[]);
      });
    }
  }, [open]);

  const knownProtonPaths = installedProtons.map(p => p.path);
  const selectedInKnown = selectedProtonPath && knownProtonPaths.includes(selectedProtonPath) ? selectedProtonPath : "";
  const isCustomProton = selectedProtonPath !== "" && !selectedInKnown;

  useEffect(() => {
    setShowCustomProton(isCustomProton);
  }, [isCustomProton]);

  const statusIcon = (() => {
    if (loading) return "⏳";
    if (setupSuccess) return "✅";
    if (setupFailed) return "❌";
    if (info?.currentProton?.name) return "🔧";
    if (info?.prefixPath) return "📁";
    return "ℹ️";
  })();

  return (
    <Modal visible={open} title={`Proton — ${gameId}`} onClose={onClose}>
      <div className="mod-manager__proton-config">
        {loading && <p>⏳ {status}</p>}
        {!loading && info && (
          <>
            <div className="mod-manager__proton-info">
              <p><strong>App ID:</strong> {info.appId || "N/A"}</p>
              <p><strong>Proton atual:</strong> {info.currentProton?.name || "Nenhum"}</p>
              <p><strong>Prefixo:</strong> {info.prefixPath || "N/A"}</p>
              <p><strong>Status:</strong> {statusIcon} {status}</p>
            </div>
            {info.error && <p className="mod-manager__proton-error">{info.error}</p>}

            <div className="mod-manager__proton-config-actions">
              <label>Caminho do Proton:</label>
              <select
                value={selectedInKnown || "__custom__"}
                onChange={e => {
                  if (e.target.value === "__custom__") {
                    setShowCustomProton(true);
                    onProtonPathChange("");
                  } else {
                    setShowCustomProton(false);
                    onProtonPathChange(e.target.value);
                  }
                }}
                className="mod-manager__config-select"
              >
                <option value="">Auto (deixar vazio)</option>
                {installedProtons.map(p => (
                  <option key={p.path} value={p.path}>{p.version} — {p.path}</option>
                ))}
                <option value="__custom__">Outro...</option>
              </select>

              {showCustomProton && (
                <input value={selectedProtonPath} onChange={e => onProtonPathChange(e.target.value)} placeholder="/path/to/proton customizado" />
              )}
              <p className="mod-manager__proton-note">⚠ O prefixo será recriado do zero automaticamente</p>
              <Button disabled={isConfiguring || !selectedProtonPath} onClick={onConfigure}>
                {isConfiguring ? "Configurando..." : "Configurar Proton"}
              </Button>
            </div>

            {setupLog.length > 0 && (
              <div className="mod-manager__setup-log">
                {setupLog.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
            {setupSuccess && <p className="mod-manager__setup-success">✓ Proton configurado com sucesso!</p>}
            {setupFailed && <p className="mod-manager__setup-error">✗ Configuração falhou</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
