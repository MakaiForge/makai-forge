import { useEffect, useState } from "react";
import type { GameCompatibilityResult } from "@types";

import "./compatibility-badge.scss";

interface CompatibilityBadgeProps {
  /** Requisitos mínimos em texto cru (formato Steam), ex.: "OS: Windows 10, Processor: ..." */
  minimum?: string | null;
  /** Requisitos recomendados em texto cru (informativo — a comparação usa o mínimo) */
  recommended?: string | null;
  /** Versão compacta (apenas o nível, sem tooltip de detalhes) */
  compact?: boolean;
}

/**
 * Badge de compatibilidade — compara o hardware do usuário (coletado na
 * primeira execução) com os requisitos mínimo/recomendado do jogo no catálogo.
 *
 * Níveis:
 *  - ok      → "Roda no mínimo" (verde)
 *  - weak    → "Roda com ressalvas" (amarelo)
 *  - no      → "Pode não rodar" (vermelho)
 *  - unknown → "Requisitos não informados" (cinza)
 *
 * Quando não há requisitos no catálogo, o componente não renderiza nada
 * (evita ruído visual em jogos sem dados).
 */
export function CompatibilityBadge({
  minimum,
  recommended,
  compact = false,
}: CompatibilityBadgeProps) {
  const [result, setResult] = useState<GameCompatibilityResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!minimum && !recommended) {
      setResult(null);
      return;
    }
    window.electron
      .checkGameCompatibility(minimum, recommended)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [minimum, recommended]);

  if (!result || result.level === "unknown") return null;

  const levelLabels: Record<string, string> = {
    ok: "Roda no mínimo",
    weak: "Roda com ressalvas",
    no: "Pode não rodar",
  };

  const titleParts = [
    levelLabels[result.level],
    ...result.below,
    ...result.met,
  ];

  return (
    <span
      className={`compatibility-badge compatibility-badge--${result.level}${
        compact ? " compatibility-badge--compact" : ""
      }`}
      title={titleParts.join("\n")}
    >
      {compact ? "●" : "✓"} {levelLabels[result.level]}
    </span>
  );
}
