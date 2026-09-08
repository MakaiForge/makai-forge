import type { ProtonFork } from "@types";
import { FORK_ALIAS, PROTON_TO_FORK_ID } from "../constants";
import { getTierColor } from "../helpers";
import type { CatalogFork } from "../types";

interface ForkListProps {
  catalogForks: CatalogFork[];
  expandedForks: Set<string>;
  recommendedForkIds: Set<string>;
  installedTools: any[];
  selectedProton: string | null;
  selectedFork: ProtonFork | null;
  selectedVersion: string;
  forkHasInstalledVersion: (versions: string[]) => boolean;
  onToggleExpand: (forkId: string) => void;
  onSelectVersion: (
    fork: ProtonFork,
    version: string,
    installedPath?: string
  ) => void;
}

export function ForkList({
  catalogForks,
  expandedForks,
  recommendedForkIds,
  installedTools,
  selectedProton,
  selectedFork,
  selectedVersion,
  forkHasInstalledVersion,
  onToggleExpand,
  onSelectVersion,
}: ForkListProps) {
  return (
    <div className="prm__forks">
      <h4>Todos os forks ({catalogForks.length})</h4>
      <p className="prm__forks-subtitle">
        Catálogo completo com classificação — ★ recomendado para este jogo, ✔ já
        instalado. Clique num fork para ver as versões e baixar.
      </p>
      <div className="prm__forks-list">
        {catalogForks.map((fork) => {
          const forkId = FORK_ALIAS[fork.id] || fork.id;
          const isExpanded = expandedForks.has(forkId);
          const isRecommended = recommendedForkIds.has(forkId);
          const hasInstalled = forkHasInstalledVersion(fork.versions);
          const isCurrentSelection = selectedFork?.fork === forkId;
          return (
            <div
              key={forkId}
              className={`prm__fork-card ${
                isCurrentSelection ? "prm__fork-card--selected" : ""
              }`}
            >
              <div
                className="prm__fork-header"
                onClick={() => onToggleExpand(forkId)}
              >
                <div className="prm__fork-header-left">
                  <div className="prm__fork-icon">
                    <span>{fork.name.charAt(0)}</span>
                  </div>
                  <div>
                    <span className="prm__fork-name">
                      {fork.name}
                      {isRecommended && (
                        <span
                          className="prm__fork-badge prm__fork-badge--recommended"
                          title="Recomendado para este jogo"
                        >
                          ★
                        </span>
                      )}
                      {hasInstalled && (
                        <span
                          className="prm__fork-badge prm__fork-badge--installed"
                          title="Possui versão instalada"
                        >
                          ✔
                        </span>
                      )}
                    </span>
                    <span className="prm__fork-version">
                      {fork.versions.length > 0
                        ? `${fork.versions.length} versões`
                        : "latest"}
                    </span>
                  </div>
                </div>
                <div className="prm__fork-header-right">
                  <span
                    className="prm__fork-tier-badge"
                    style={{
                      borderColor: getTierColor(fork.ranking),
                      color: getTierColor(fork.ranking),
                    }}
                  >
                    {fork.ranking}
                  </span>
                  <span className="prm__fork-score">{fork.tierScore}</span>
                  <span className="prm__fork-expand">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="prm__fork-versions">
                  {fork.versions.map((ver: string) => {
                    const installedTool = installedTools.find((t: any) => {
                      const tForkId =
                        PROTON_TO_FORK_ID[t.tool?.id] || t.tool?.id;
                      return (
                        tForkId === forkId &&
                        (t.version === ver || t.path?.includes(ver))
                      );
                    });
                    const isSelected =
                      selectedProton === installedTool?.path ||
                      (selectedFork?.fork === forkId &&
                        selectedVersion === ver);
                    return (
                      <div
                        key={`${forkId}-${ver}`}
                        className={`prm__version ${
                          isSelected ? "prm__version--selected" : ""
                        }`}
                        onClick={() =>
                          onSelectVersion(
                            {
                              fork: forkId,
                              name: fork.name,
                              version: ver,
                              tier: fork.ranking,
                              tierScore: fork.tierScore,
                              confidence: "manual",
                            },
                            ver,
                            installedTool?.path
                          )
                        }
                      >
                        <span className="prm__version-name">{ver}</span>
                        <span className="prm__version-status">
                          {installedTool ? (
                            <span className="prm__version-installed">
                              ✔ Instalado
                            </span>
                          ) : (
                            <span className="prm__version-not-installed">
                              Não instalado
                            </span>
                          )}
                        </span>
                        {isSelected && (
                          <span className="prm__version-check">✓</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
