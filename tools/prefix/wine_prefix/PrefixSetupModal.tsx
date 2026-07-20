import { useMemo } from "react";
import { Modal } from "@components";
import makaiIcon from "@resources/icons/icon.png";
import "./PrefixSetupModal.scss";

interface PrefixSetupModalProps {
  visible: boolean;
  gameName: string;
  log: string[];
  result: { ok: boolean; msg: string } | null;
  onClose: () => void;
}

const STAGES = [
  { key: "busca", label: "Buscando jogo", icon: "🔍" },
  { key: "limpeza", label: "Limpando prefixo", icon: "🧹" },
  { key: "verificacao", label: "Verificando Proton", icon: "🔧" },
  { key: "config", label: "Configurando Steam", icon: "⚙" },
  { key: "criacao", label: "Criando prefixo", icon: "📁" },
  { key: "dlls", label: "Aplicando DLLs", icon: "📦" },
  { key: "verificacao_final", label: "Verificação final", icon: "✓" },
];

function detectStage(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.includes("▶")) continue;
    if (l.includes("🔍")) return 0;
    if (l.includes("🧹")) return 1;
    if (l.includes("🔧")) return 2;
    if (l.includes("⚙")) return 3;
    if (l.includes("📁")) return 4;
    if (l.includes("📦")) return 5;
    if (l.includes("✓") || l.includes("════")) return 6;
  }
  return -1;
}

export function PrefixSetupModal({
  visible,
  gameName,
  log,
  result,
  onClose,
}: PrefixSetupModalProps) {
  const currentStage = useMemo(() => detectStage(log), [log]);
  const progress = result
    ? 100
    : currentStage < 0 ? 5
    : Math.min(95, Math.round((currentStage / (STAGES.length - 1)) * 85) + 5);

  return (
    <Modal visible={visible} title="" onClose={result ? onClose : () => {}} noContentPadding clickOutsideToClose={!!result}>
      <div className="pfs">
        <div className="pfs__head">
          <img src={makaiIcon} alt="" width="40" height="40" />
          <div>
            <div className="pfs__title">Configurando Proton</div>
            <div className="pfs__game">{gameName}</div>
          </div>
        </div>

        <div className="pfs__bar">
          <div className="pfs__bar-track">
            <div
              className={`pfs__bar-fill ${result ? (result.ok ? "--ok" : "--fail") : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="pfs__bar-label">{result ? "100%" : `${progress}%`}</span>
        </div>

        <div className="pfs__stages">
          {STAGES.map((s, i) => {
            const done = currentStage > i || !!result;
            const active = currentStage === i;
            const failed = result && !result.ok && active;
            return (
              <div
                key={s.key}
                className={`pfs__stage ${done ? "--done" : ""} ${active ? "--active" : ""} ${failed ? "--fail" : ""}`}
              >
                <span className="pfs__stage-icon">{done && !failed ? "✓" : active && !failed ? s.icon : failed ? "✗" : s.icon}</span>
                <span className="pfs__stage-label">{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="pfs__log">
          {log.length === 0 && !result && (
            <div className="pfs__pending">Preparando...</div>
          )}
          {log.map((line, i) => (
            <div
              key={i}
              className={`pfs__line ${
                line.startsWith("❌") ? "--error"
                : line.startsWith("✅") ? "--done"
                : line.startsWith("⚠") ? "--warn"
                : line.includes("▶") ? "--header"
                : ""
              }`}
            >
              {line}
            </div>
          ))}
          {!result && log.length > 0 && (
            <div className="pfs__spinner" />
          )}
        </div>

        {result && (
          <div className={`pfs__result ${result.ok ? "--ok" : "--fail"}`}>
            <span>{result.msg}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
