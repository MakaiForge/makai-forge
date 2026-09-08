import { useEffect, useRef } from "react";

interface Step {
  key: string
  label: string
  status: "waiting" | "working" | "done" | "error"
  message?: string
}

interface LaunchOverlayProps {
  gameName: string
  steps: Step[]
  onCancel: () => void
}

export function LaunchOverlay({ gameName, steps, onCancel }: LaunchOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mod-manager__launch-overlay">
      <div className="mod-manager__launch-card" ref={cardRef}>
        <h2 className="mod-manager__launch-title">{gameName}</h2>

        <div className="mod-manager__launch-steps">
          {steps.map(s => (
            <div key={s.key} className={`mod-manager__launch-step mod-manager__launch-step--${s.status}`}>
              <div className="mod-manager__launch-step-icon">
                {s.status === "working" && <div className="mod-manager__launch-spinner" />}
                {s.status === "done" && <span className="mod-manager__launch-check">✓</span>}
                {s.status === "error" && <span className="mod-manager__launch-cross">✗</span>}
                {s.status === "waiting" && <span className="mod-manager__launch-dot">○</span>}
              </div>
              <div className="mod-manager__launch-step-body">
                <p className="mod-manager__launch-step-label">{s.label}</p>
                {s.message && <p className="mod-manager__launch-step-msg">{s.message}</p>}
              </div>
            </div>
          ))}
        </div>

        {steps.some(s => s.status === "working") && (
          <p className="mod-manager__launch-sub">Aguarde, não feche o aplicativo...</p>
        )}

        <div className="mod-manager__launch-actions">
          <button className="mod-manager__launch-btn" onClick={onCancel}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
