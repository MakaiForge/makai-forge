import { useEffect, useRef } from "react";
import "./prefix-progress-modal.scss";

interface PrefixProgressModalProps {
  gameName: string;
  progressMsg: string;
  result: { ok: boolean; msg: string } | null;
  onClose: () => void;
}

export function PrefixProgressModal({
  gameName,
  progressMsg,
  result,
  onClose,
}: PrefixProgressModalProps) {
  const msgEndRef = useRef<HTMLDivElement>(null);
  const lines = progressMsg.split("\n").filter(Boolean);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  useEffect(() => {
    if (result?.ok) {
      const timer = setTimeout(onClose, 2500);
      return () => clearTimeout(timer);
    }
    return;
  }, [result, onClose]);

  return (
    <div className="prefix-progress-overlay" onClick={result ? onClose : undefined}>
      <div
        className="prefix-progress-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prefix-progress-modal__header">
          <h3>Configurando Proton: {gameName}</h3>
          {result && (
            <button
              className="prefix-progress-modal__close"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>

        <div className="prefix-progress-modal__body">
          {lines.length === 0 && !result && (
            <div className="prefix-progress-modal__pending">
              Preparando...
            </div>
          )}
          {lines.map((line, i) => (
            <div
              key={i}
              className={`prefix-progress-modal__line ${
                line.startsWith("❌")
                  ? "--error"
                  : line.startsWith("✅")
                  ? "--done"
                  : line.startsWith("⚠")
                  ? "--warn"
                  : ""
              }`}
            >
              {line}
            </div>
          ))}
          {!result && lines.length > 0 && (
            <div className="prefix-progress-modal__spinner" ref={msgEndRef}>
              ⏳
            </div>
          )}
        </div>

        {result && (
          <div
            className={`prefix-progress-modal__result ${
              result.ok ? "--ok" : "--fail"
            }`}
          >
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
