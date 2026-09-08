import type { ManualGroup } from "../types";

interface ManualListProps {
  manualGroups: ManualGroup[];
  expandedForks: Set<string>;
  selectedProton: string | null;
  onToggleExpand: (id: string) => void;
  onSelectManual: (path: string, version: string) => void;
}

export function ManualList({
  manualGroups,
  expandedForks,
  selectedProton,
  onToggleExpand,
  onSelectManual,
}: ManualListProps) {
  return (
    <>
      <div className="proton-recommendation-modal__divider">
        <span>ou escolha manualmente</span>
      </div>
      {manualGroups.length === 0 && (
        <p className="proton-recommendation-modal__no-protons">
          Nenhum Proton instalado localmente.
        </p>
      )}
      <div className="proton-recommendation-modal__manual-list">
        {manualGroups.map((group) => {
          const isExpanded = expandedForks.has(`manual-${group.id}`);
          return (
            <div
              key={group.id}
              className="proton-recommendation-modal__manual-group"
            >
              <div
                className="proton-recommendation-modal__manual-group-header"
                onClick={() => onToggleExpand(`manual-${group.id}`)}
              >
                <div className="proton-recommendation-modal__manual-group-header-left">
                  <span className="proton-recommendation-modal__manual-group-arrow">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                  <div>
                    <div className="proton-recommendation-modal__manual-group-title">
                      {group.title}
                    </div>
                    {group.description && (
                      <span className="proton-recommendation-modal__manual-group-desc">
                        {group.description}
                      </span>
                    )}
                  </div>
                </div>
                <span className="proton-recommendation-modal__manual-group-count">
                  {group.installed.length} instalada(s)
                </span>
              </div>
              {isExpanded && (
                <div className="proton-recommendation-modal__manual-versions">
                  {group.installed.map((item) => {
                    const isSelected = selectedProton === item.path;
                    return (
                      <div
                        key={item.path}
                        className={`proton-recommendation-modal__manual-version ${
                          isSelected
                            ? "proton-recommendation-modal__manual-version--selected"
                            : ""
                        }`}
                        onClick={() => onSelectManual(item.path, item.version)}
                      >
                        <div className="proton-recommendation-modal__manual-version-left">
                          <span className="proton-recommendation-modal__manual-version-name">
                            {item.version}
                          </span>
                          <span className="proton-recommendation-modal__manual-version-path">
                            {item.path}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="proton-recommendation-modal__manual-check">
                            ✓
                          </span>
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
    </>
  );
}
