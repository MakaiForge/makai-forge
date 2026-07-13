import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button } from "@renderer/components";
import "./GameReadinessModal.scss";

export interface GameReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  action?: "configure" | "create_prefix" | "install_proton";
}

export interface GameReadinessResult {
  ok: boolean;
  checks: GameReadinessCheck[];
}

interface GameReadinessModalProps {
  open: boolean;
  result: GameReadinessResult | null;
  gameId: string;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onConfigure?: () => void;
}

export function GameReadinessModal({
  open,
  result,
  gameId,
  onClose,
  onRetry,
  onConfigure,
}: GameReadinessModalProps) {
  const { t } = useTranslation("mod_manager");
  const [creatingPrefix, setCreatingPrefix] = useState(false);
  const [prefixResult, setPrefixResult] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCreatingPrefix(false);
      setPrefixResult(null);
    }
  }, [open]);

  const handleCreatePrefix = useCallback(async () => {
    setCreatingPrefix(true);
    setPrefixResult(null);
    try {
      const res = await (window.electron as any).createModPrefix(gameId);
      if (res?.ok) {
        setPrefixResult("Prefixo criado com sucesso!");
        await onRetry();
      } else {
        setPrefixResult(res?.error || "Falha ao criar prefixo");
      }
    } catch (err) {
      setPrefixResult(`Erro: ${String(err).slice(0, 150)}`);
    } finally {
      setCreatingPrefix(false);
    }
  }, [gameId, onRetry]);

  if (!open || !result) return null;

  const failedChecks = result.checks.filter(c => !c.ok);
  const hasPrefixIssue = failedChecks.some(c => c.action === "create_prefix");
  const hasConfigIssue = failedChecks.some(c => c.action === "configure" || c.action === "install_proton");
  const allOk = result.ok;

  return (
    <Modal
      visible={open}
      title={t("game_readiness_title", "Verificando Pré-requisitos")}
      onClose={onClose}
    >
      <div className="game-readiness__modal">
        <p className="game-readiness__modal-intro">
          {allOk
            ? t("game_readiness_all_ok", "Todos os pré-requisitos estão OK. A instalação começará automaticamente.")
            : t("game_readiness_needs_setup", "Alguns pré-requisitos precisam ser configurados antes de instalar mods.")}
        </p>

        <div className="game-readiness__modal-checks">
          {result.checks.map((check) => (
            <div
              key={check.id}
              className={`game-readiness__modal-check game-readiness__modal-check--${check.ok ? "ok" : "error"}`}
            >
              <div className={`game-readiness__modal-icon game-readiness__modal-icon--${check.ok ? "ok" : "error"}`}>
                {check.ok ? "✓" : "✗"}
              </div>
              <div className="game-readiness__modal-info">
                <div className="game-readiness__modal-label">{check.label}</div>
                <div className="game-readiness__modal-message">{check.message}</div>
              </div>
            </div>
          ))}
        </div>

        {prefixResult && (
          <div className="game-readiness__modal-check game-readiness__modal-check--ok" style={{ marginTop: 8 }}>
            <div className="game-readiness__modal-icon game-readiness__modal-icon--ok">✓</div>
            <div className="game-readiness__modal-info">
              <div className="game-readiness__modal-message">{prefixResult}</div>
            </div>
          </div>
        )}

        <div className="game-readiness__modal-actions">
          {hasConfigIssue && onConfigure && (
            <Button theme="primary" onClick={onConfigure}>
              {t("game_readiness_configure", "Configurar Jogo")}
            </Button>
          )}

          {hasPrefixIssue && (
            <Button
              theme="primary"
              onClick={handleCreatePrefix}
              disabled={creatingPrefix}
            >
              {creatingPrefix ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="game-readiness__modal-spinner" />
                  {t("game_readiness_creating_prefix", "Criando Prefixo...")}
                </span>
              ) : (
                t("game_readiness_create_prefix", "Criar Prefixo")
              )}
            </Button>
          )}

          {allOk && (
            <Button theme="primary" onClick={onClose}>
              {t("game_readiness_continue", "Continuar Instalação")}
            </Button>
          )}

          <Button onClick={onClose}>
            {t("cancel", "Cancelar")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
