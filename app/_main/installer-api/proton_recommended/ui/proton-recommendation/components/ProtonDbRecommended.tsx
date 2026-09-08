import type { ProtonDbData } from "../types";

interface ProtonDbRecommendedProps {
  protonDbData: ProtonDbData | null;
  findInstalled: (version: string) => { path: string; version: string } | null;
  onSelectRecommended: (version: string) => void;
}

export function ProtonDbRecommended({
  protonDbData,
  findInstalled,
  onSelectRecommended,
}: ProtonDbRecommendedProps) {
  if (!protonDbData || protonDbData.recommended.length === 0) return null;
  return (
    <div className="prm__db-recommended">
      <h4>🔍 ProtonDB — Recomendado para este jogo</h4>
      <p className="prm__db-subtitle">
        {protonDbData.totalReports} reports analisados — baseado em dados da
        comunidade
      </p>
      <div className="prm__db-recommended-list">
        {protonDbData.recommended.map((ver) => {
          const versionInfo = protonDbData.versions.find(
            (v) => v.version === ver
          );
          const installed = findInstalled(ver);
          return (
            <div
              key={ver}
              className={`prm__db-version prm__db-version--clickable ${
                installed ? "prm__db-version--installed" : ""
              }`}
              onClick={() => onSelectRecommended(ver)}
            >
              <div className="prm__db-version-left">
                <span className="prm__db-version-name">{ver}</span>
                {versionInfo && (
                  <span className="prm__db-version-stats">
                    {Math.round(versionInfo.positiveRatio * 100)}% positivo ·{" "}
                    {versionInfo.total}{" "}
                    {versionInfo.total === 1 ? "report" : "reports"}
                  </span>
                )}
              </div>
              <span
                className={`prm__db-version-action ${
                  installed ? "prm__db-version-action--installed" : ""
                }`}
              >
                {installed ? "✓ Instalado" : "Baixar"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
