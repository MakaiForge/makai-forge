import { useEffect, useState } from "react";
import { Modal } from "@components";
import "./proton-recommendation-modal.scss";

import type { ProtonFork } from "@types";
import type { ProtonRecommendationModalProps } from "./proton-recommendation/types";
import { useProtonSelection } from "./proton-recommendation/use-proton-selection";
import { useProtonDerived } from "./proton-recommendation/use-proton-derived";
import { StatusState } from "./proton-recommendation/components/StatusState";
import { SelectedSummary } from "./proton-recommendation/components/SelectedSummary";
import { ProtonDbRecommended } from "./proton-recommendation/components/ProtonDbRecommended";
import { ForkList } from "./proton-recommendation/components/ForkList";
import { ManualList } from "./proton-recommendation/components/ManualList";
import { ActionsBar } from "./proton-recommendation/components/ActionsBar";

export function ProtonRecommendationModal({
  visible,
  gameId,
  gameTitle,
  installedProtons: _installedProtons,
  mode = "install",
  currentProtonPath,
  onClose,
  onSelect,
  onSwitchProton,
  onDownloadAndSelect,
}: ProtonRecommendationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allForks, setAllForks] = useState<ProtonFork[]>([]);
  const [installedTools, setInstalledTools] = useState<any[]>([]);
  const [forkCatalog, setForkCatalog] = useState<any[]>([]);
  const [protonDbData, setProtonDbData] = useState<any | null>(null);
  const [allTools, setAllTools] = useState<any[]>([]);
  const [expandedForks, setExpandedForks] = useState<Set<string>>(new Set());

  const derived = useProtonDerived(forkCatalog, installedTools, allTools, allForks);
  const selection = useProtonSelection({
    installedTools,
    forkInfoMap: derived.forkInfoMap,
    allForks,
    mode,
    onSelect,
    onSwitchProton,
    onDownloadAndSelect,
  });

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setAllForks([]);
    setInstalledTools([]);
    setForkCatalog([]);
    setProtonDbData(null);
    setAllTools([]);
    setExpandedForks(new Set());
    selection.reset();
    Promise.all([
      window.electron.recommendProton(gameId),
      window.electron.getInstalledProtonTools(),
      window.electron.getForkCatalog().catch(() => []),
      window.electron.getProtonDbData(gameId).catch(() => null),
      window.electron.getProtonTools().catch(() => []),
    ])
      .then(([recommendation, tools, catalog, protonDb, protonTools]) => {
        const forks: ProtonFork[] = [];
        if (recommendation?.primary) forks.push(recommendation.primary);
        if (recommendation?.alternatives) {
          for (const alt of recommendation.alternatives) {
            if (!forks.find((f) => f.fork === alt.fork)) forks.push(alt);
          }
        }
        setAllForks(forks);
        setInstalledTools(tools as any[]);
        setForkCatalog(catalog);
        setProtonDbData(protonDb as any);
        setAllTools(protonTools as any[]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Falha ao obter forks");
        setLoading(false);
      });
  }, [visible, gameId, selection.reset]);

  useEffect(() => {
    if (!visible) return;
    const unsub = window.electron.onInstallProgress((data) => {
      selection.setDownloadProgress(data);
    });
    return unsub;
  }, [visible, selection.setDownloadProgress]);

  const toggleExpand = (forkId: string) => {
    setExpandedForks((prev) => {
      const next = new Set(prev);
      if (next.has(forkId)) next.delete(forkId);
      else next.add(forkId);
      return next;
    });
  };

  const hasSelection = Boolean(selection.selectedProton || selection.selectedFork);

  return (
    <Modal
      visible={visible}
      title={mode === "switch" ? `Trocar Proton — ${gameTitle}` : `Selecionar Proton — ${gameTitle}`}
      onClose={onClose}
      large
    >
      <div className="proton-recommendation-modal">
        <StatusState loading={loading} error={error} />
        {!loading && !error && (
          <>
            {mode === "switch" && (
              <div className="prm__switch-warning">
                <p>
                  ⚠️ Trocar o Proton recriará o prefixo do jogo. <strong>Saves serão preservados</strong>, mas
                  configurações de mods e registry serão recriadas.
                </p>
                {currentProtonPath && (
                  <p className="prm__switch-current">
                    Proton atual: <code>{currentProtonPath.split("/").pop()}</code>
                  </p>
                )}
              </div>
            )}
            {hasSelection && (
              <SelectedSummary
                mode={mode}
                selectedFork={selection.selectedFork}
                selectedProton={selection.selectedProton}
                selectedVersion={selection.selectedVersion}
                selectedDisplayName={selection.selectedDisplayName}
                isDownloading={selection.isDownloading}
                downloadProgress={selection.downloadProgress}
                switching={selection.switching}
                switchResult={selection.switchResult}
                onConfirm={selection.handleConfirm}
                onClear={() => {
                  selection.setSelectedFork(null);
                  selection.setSelectedProton(null);
                  selection.setSelectedVersion("");
                  selection.setDownloadProgress(null);
                  selection.setSwitchResult(null);
                }}
              />
            )}
            <ProtonDbRecommended
              protonDbData={protonDbData}
              findInstalled={selection.findInstalled}
              onSelectRecommended={selection.handleSelectRecommendedVersion}
            />
            <ForkList
              catalogForks={derived.catalogForks}
              expandedForks={expandedForks}
              recommendedForkIds={derived.recommendedForkIds}
              installedTools={installedTools}
              selectedProton={selection.selectedProton}
              selectedFork={selection.selectedFork}
              selectedVersion={selection.selectedVersion}
              forkHasInstalledVersion={selection.forkHasInstalledVersion}
              onToggleExpand={toggleExpand}
              onSelectVersion={selection.handleSelectVersion}
            />
            <ManualList
              manualGroups={derived.manualGroups}
              expandedForks={expandedForks}
              selectedProton={selection.selectedProton}
              onToggleExpand={toggleExpand}
              onSelectManual={selection.handleSelectManual}
            />
            {hasSelection && (
              <ActionsBar
                mode={mode}
                selectedProton={selection.selectedProton}
                selectedDisplayName={selection.selectedDisplayName}
                selectedVersion={selection.selectedVersion}
                isDownloading={selection.isDownloading}
                switching={selection.switching}
                switchResult={selection.switchResult}
                onClose={onClose}
                onConfirm={selection.handleConfirm}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
