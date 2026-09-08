import { useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@components";
import { BrowserMirror } from "@components/browser-view";
import type { ModlistEntry } from "./types";
import type { ProtonVersion } from "@types";

import { useModLog, useMods, useDeploy, useFomod, useMedia, useRightPanel, useModManagerShortcuts, usePlugins, useSplitPane, useConflictBadges, useSortPlugins } from "./hooks";
import { useInstallOrchestrator } from "./hooks/mods/useInstallOrchestrator";
import { useFomodComponents } from "./hooks/useFomodComponents";
import { useProtonSetup } from "./hooks/useProtonSetup";
import { useHealthCheck } from "./hooks/useHealthCheck";
import { useBainHandlers } from "./hooks/useBainHandlers";
import { useLaunchGame } from "./hooks/useLaunchGame";
import { useModActions } from "./hooks/useModActions";
import { useGameConfigActions } from "./hooks/useGameConfigActions";
import { InstallProgressOverlay } from "./components/InstallProgressOverlay";
import { InstallResultOverlay } from "./components/InstallResultOverlay";
import { HealthBanner } from "./components/HealthBanner";
import { useGameConfig, useProfiles, GamePresetBar } from "../presets";
import { ModListPanel, RightPanel, StatusBar, ModManagerTopBar, ModManagerTabs, GameConfigPanel, GameDetectionWizard, LaunchOverlay, PlayErrorModal } from "./components";
import { ProtonRecommendationModal } from "@provision/proton_recommended/ui/proton-recommendation-modal";
import { AddProfileModal, ConflictsModal, DeployConfirmModal, DeployResultModal, OverwriteModal, PreviewModal, ReadmeModal } from "./components/Modals";
import { ConflictDetailsModal } from "./components/Modals/ConflictDetailsModal";
import { GameReadinessModal } from "./components/Modals/GameReadinessModal";
import { PrefixSetupModal } from "@container/wine_prefix/PrefixSetupModal";
import { FomodDialog } from "./components/FomodDialog";
import { BainDialog } from "./components/BainDialog";

import "./ModManager.scss";

type TabId = "mods" | "navegador";

const DEFAULT_BROWSER_URL = "https://www.nexusmods.com";

export default function ModManager() {
  const { t } = useTranslation("mod_manager");

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<TabId>("mods");
  const [showProtonSelector, setShowProtonSelector] = useState(false);
  const [protonSelectorMode, setProtonSelectorMode] = useState<"install" | "switch">("install");
  const [installedProtons, setInstalledProtons] = useState<ProtonVersion[]>([]);
  const [showDetectionWizard, setShowDetectionWizard] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  const [selectedConflictMod, setSelectedConflictMod] = useState<ModlistEntry | null>(null);

  // ── Core hooks ──
  const { log, addLog } = useModLog();
  const { games, setGames, selectedGame, setSelectedGame, currentGame, showGameConfig, setShowGameConfig, configGamePath, setConfigGamePath, configStagingDir, setConfigStagingDir, configPrefixPath, setConfigPrefixPath, configProtonPath, setConfigProtonPath, saveGameConfig, discoverInstalledGames } = useGameConfig();
  const { profiles, selectedProfile, setSelectedProfile, createProfile } = useProfiles(selectedGame);
  const { mods, filteredMods, searchQuery, setSearchQuery, mediaMap, selectedModIdx, setSelectedModIdx, loadMods, toggleMod, reorderMods, removeMod, deleteMod, toggleLock, addSeparator, loading } = useMods(selectedGame, selectedProfile);
  const selectedMod = useMemo((): ModlistEntry | null => selectedModIdx !== null ? filteredMods[selectedModIdx] ?? null : null, [selectedModIdx, filteredMods]);
  const filteredModsRef = useRef(filteredMods);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleModInstalled = useCallback((modName: string) => {
    const currentFiltered = filteredModsRef.current;
    const idx = currentFiltered.findIndex(m => m.name === modName);
    if (idx >= 0) setSelectedModIdx(idx);
  }, []);

  // ── Feature hooks ──
  const { conflictSet, conflictDetails, allConflicts } = useConflictBadges(mods);
  const { deploying, deployResult, setDeployResult, conflicts, showConflicts, setShowConflicts, showDeployConfirm, setShowDeployConfirm, handleDeploy, detectAndShowConflicts } = useDeploy(selectedGame, selectedProfile, addLog);
  const { showFomod, filteredSteps, loading: fomodLoading, error: fomodError, currentStep, installing: fomodInstalling, openFomod, handleTogglePlugin, handleNextStep, handlePrevStep, handleInstall, handleFomodCancel, handleResetSelections } = useFomod(addLog, loadMods, selectedGame, handleModInstalled);
  const { showPreview, setShowPreview, previewImages, previewIndex, previewCurrentData, showReadme, setShowReadme, readmeData, openPreview, openReadme } = useMedia();
  const { activeRightTab, setActiveRightTab, modFiles, iniFiles, selectedIni, setSelectedIni, iniContent, setIniContent, dataFiles, excludedFiles, toggleExcludedFile } = useRightPanel(selectedMod, selectedGame);
  const { plugins, togglePlugin } = usePlugins(selectedGame, selectedProfile, mods);
  const { sorting, sortWarnings, handleSortPlugins } = useSortPlugins(selectedGame, plugins, mods, addLog);

  // ── Domain hooks ──
  const fomod = useFomodComponents({ selectedMod, selectedGame, addLog, setActiveRightTab, allConflicts });
  const proton = useProtonSetup({ configPrefixPath, selectedGame, configGamePath, configStagingDir, addLog, saveGameConfig, setConfigProtonPath });
  const health = useHealthCheck({ selectedGame, configGamePath, configProtonPath, setShowGameConfig, setOriginalProtonPath: proton.setOriginalProtonPath });
  const bain = useBainHandlers({ addLog, loadMods });
  const launch = useLaunchGame({ selectedGame, selectedProfile: selectedProfile || "", currentGame, addLog });

  // ── Install orchestrator ──
  const {
    stage: installStage,
    progress: installProgressOrch,
    result: installResultOrch,
    isInstalling: isOrchInstalling,
    canCancel: canCancelInstall,
    startInstall: startOrchInstall,
    cancel: cancelOrchInstall,
    dismissResult: dismissOrchResult,
    verifyResult: gameReadinessResult,
    dismissVerify: dismissGameReadiness,
    reVerify: reVerifyGameReadiness,
    pendingOverwrite: orchPendingOverwrite,
    confirmOverwrite: orchConfirmOverwrite,
    cancelOverwrite: orchCancelOverwrite,
  } = useInstallOrchestrator(selectedGame, selectedProfile || "", configStagingDir, addLog, loadMods);

  // ── Action hooks ──
  const modActions = useModActions({ selectedGame, selectedModIdx, filteredMods, mods, addLog, removeMod, deleteMod, toggleMod, setSelectedModIdx, detectAndShowConflicts });
  const gameConfigActions = useGameConfigActions({ selectedGame, configGamePath, configStagingDir, configPrefixPath, configProtonPath, addLog, saveGameConfig, setSelectedGame, setGames, setConfigGamePath, setConfigStagingDir, setConfigPrefixPath, setShowGameConfig, discoverInstalledGames });

  // ── Derived ──
  const modsActive = mods.filter(m => m.enabled).length;

  // ── Callbacks ──

  const pickAndOrchInstall = useCallback(async () => {
    try {
      const result = await window.electron.showOpenDialog({
        title: t("install_mod_desc"),
        filters: [
          { name: "Mod Archives", extensions: ["zip", "7z", "rar", "fomod", "tar.gz"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths.length) return;
      const archivePath = result.filePaths[0];
      const installResult = await startOrchInstall(archivePath);
      if (installResult?.success && installResult.hasFomod) {
        await loadMods();
        openFomod(installResult.stagingDir, archivePath, installResult.modName);
      }
    } catch (err) {
      addLog(`Erro ao selecionar arquivo: ${String(err)}`);
    }
  }, [startOrchInstall, addLog, openFomod, loadMods, t]);

  const handleConflictClick = useCallback((mod: ModlistEntry) => {
    setSelectedConflictMod(mod);
    setShowConflictDetails(true);
  }, []);

  const handleApplyConflictResolution = useCallback((deselectedMods: string[]) => {
    for (const modName of deselectedMods) {
      const idx = mods.findIndex(m => m.name === modName);
      if (idx !== -1 && mods[idx].enabled) {
        toggleMod(idx);
      }
    }
    setShowConflictDetails(false);
    setSelectedConflictMod(null);
  }, [mods, toggleMod]);

  const handleLaunchWrapper = useCallback(() => {
    if (!selectedGame) { setShowDetectionWizard(true); return; }
    launch.handleLaunchClick();
  }, [selectedGame, launch.handleLaunchClick]);

  const handleProtonConfigOpen = useCallback((mode: "install" | "switch") => {
    setProtonSelectorMode(mode);
    setShowProtonSelector(true);
  }, []);

  const { onDividerMouseDown } = useSplitPane(containerRef);

  useModManagerShortcuts({
    selectedModIdx,
    filteredMods,
    onSearchFocus: () => searchRef.current?.focus(),
    onDeploy: handleDeploy,
    onRemoveMod: (name: string) => { removeMod(name); setSelectedModIdx(null); },
    onDeselect: () => setSelectedModIdx(null),
  });

  // ── JSX ──
  return (
    <div className="mod-manager">
      {launch.showLaunchOverlay && (
        <LaunchOverlay
          gameName={currentGame?.name || selectedGame}
          steps={launch.launchSteps}
          onCancel={() => { window.electron.modKillGame(); launch.setShowLaunchOverlay(false); }}
        />
      )}

      <PlayErrorModal open={!!launch.playError} error={launch.playError?.error || ""} gameId={selectedGame || ""} gamePath={configGamePath} prefixPath={configPrefixPath} protonPath={configProtonPath} failedStep={launch.playError?.failedStep} onClose={() => launch.setPlayError(null)} />

      <ProtonRecommendationModal visible={showProtonSelector} gameId={selectedGame!} gameTitle={currentGame?.name || selectedGame || ""} installedProtons={installedProtons} mode={protonSelectorMode} currentProtonPath={configProtonPath} onClose={async () => { setShowProtonSelector(false); health.rescanEnvironment(); if (gameReadinessResult) await reVerifyGameReadiness(); }} onSelect={proton.handleProtonSelect} onSwitchProton={proton.handleSwitchProton} onDownloadAndSelect={proton.handleDownloadAndSelect} />

      <ModManagerTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "mods" && (
        <>
          <div className="mod-manager__topbar">
            <div className="mod-manager__topbar-left">
              <GamePresetBar games={games} selectedGame={selectedGame} profiles={profiles} selectedProfile={selectedProfile} onGameChange={(g) => { setSelectedGame(g); setSelectedModIdx(null); }} onProfileChange={setSelectedProfile} onGameConfig={() => { proton.setOriginalProtonPath(configProtonPath); setShowGameConfig(true); }} onAddProfile={() => setShowAddProfile(true)} onDetectGames={() => setShowDetectionWizard(true)} />
            </div>
            <ModManagerTopBar deploying={deploying} installing={isOrchInstalling} launching={launch.isLaunching} hasGame={!!selectedGame} selectedModIdx={selectedModIdx} depsMissing={health.healthReport?.depsMissing || []} t={t} onInstallMod={() => pickAndOrchInstall()} onDeploy={modActions.handleDeployClick} onLaunchGame={handleLaunchWrapper} onProtonConfig={() => handleProtonConfigOpen("install")} onRefresh={() => { loadMods(); addLog(t("refresh")); }} onRemoveMod={modActions.handleRemoveMod} />
          </div>

          {health.healthBanner && <HealthBanner status={health.healthBanner.status} message={health.healthBanner.message} onConfigure={health.openConfigForFix} />}

          <GameDetectionWizard open={showDetectionWizard} onClose={() => setShowDetectionWizard(false)} onGameDetected={gameConfigActions.handleDetectionWizardGame} selectedGameId={selectedGame || undefined} />

          <div className="mod-manager__main" ref={containerRef}>
            <div className="mod-manager__left">
              <ModListPanel mods={filteredMods} selectedMod={selectedMod} searchQuery={searchQuery} mediaCache={mediaMap} loading={loading} searchRef={searchRef} conflicts={conflictSet} conflictDetails={conflictDetails} onToggle={(idx) => toggleMod(idx)} onSelect={(mod) => { if (!mod) { setSelectedModIdx(null); return; } const idx = filteredModsRef.current.findIndex(m => m.name === mod.name); if (idx === -1) return; setSelectedModIdx(prev => prev === idx ? null : idx); }} onSearch={setSearchQuery} onReorder={(from, to) => reorderMods(from, to)} onPreview={(mod) => openPreview(mod.stagingDir)} onReadme={(mod) => openReadme(mod.stagingDir)} onLock={(idx) => toggleLock(idx)} onAddSeparator={(idx) => addSeparator(idx)} onRemoveMod={(name) => { removeMod(name); setSelectedModIdx(null); }} onDeleteMod={modActions.handleDeleteMod} onEslify={modActions.handleEslify} onReconfigureFomod={(modName) => { const mod = mods.find(m => m.name === modName); if (mod?.stagingDir && mod.hasFomod) openFomod(mod.stagingDir, "", mod.name); }} onConflictClick={handleConflictClick} />
            </div>
            <div className="mod-manager__divider" onMouseDown={onDividerMouseDown} />
            <div className="mod-manager__right">
              <RightPanel selectedMod={selectedMod} plugins={plugins} modFiles={modFiles ?? []} excludedFiles={excludedFiles} dataFolderEntries={dataFiles} iniFiles={iniFiles} selectedIni={selectedIni} iniContent={iniContent} activeRightTab={activeRightTab} onTabChange={setActiveRightTab} onTogglePlugin={togglePlugin} onToggleExclude={toggleExcludedFile} onIniSelect={(path, content) => { setSelectedIni(path); setIniContent(content); }} onIniChange={setIniContent} fomodComponents={fomod.fomodComponents} onToggleFomodComponent={fomod.handleToggleFomodComponent} onReconfigureFomod={() => { if (selectedMod?.stagingDir && selectedMod.hasFomod) openFomod(selectedMod.stagingDir, "", selectedMod.name); }} onDetectFomodComponents={fomod.handleDetectFomodComponents} fomodConflicts={fomod.fomodConflicts} />
            </div>
          </div>

          <StatusBar log={log} modsTotal={mods.length} modsActive={modsActive} />
          {sortWarnings.length > 0 && <div className="mod-manager__sort-warnings">{sortWarnings.map((w, i) => <p key={i} className="mod-manager__sort-warning">{w}</p>)}</div>}

          <OverwriteModal open={orchPendingOverwrite !== null} modName={orchPendingOverwrite?.modName} onConfirm={orchConfirmOverwrite} onCancel={orchCancelOverwrite} />
          <GameReadinessModal open={gameReadinessResult !== null && !gameReadinessResult?.ok} result={gameReadinessResult} gameId={selectedGame} onClose={dismissGameReadiness} onRetry={reVerifyGameReadiness} onConfigure={() => { proton.setOriginalProtonPath(configProtonPath); setShowGameConfig(true); }} onPreparePrefix={() => { handleProtonConfigOpen("install"); }} />
          <DeployResultModal open={deployResult !== null} result={deployResult} onClose={() => setDeployResult(null)} />

          <Modal visible={showGameConfig} title={t("configure_game_title", { name: currentGame?.name || selectedGame })} onClose={async () => { setShowGameConfig(false); health.rescanEnvironment(); if (gameReadinessResult) await reVerifyGameReadiness(); }}>
            <GameConfigPanel open={showGameConfig} selectedGame={selectedGame} configGamePath={configGamePath} configStagingDir={configStagingDir} configPrefixPath={configPrefixPath} configProtonPath={configProtonPath} originalProtonPath={proton.originalProtonPath} onGamePathChange={setConfigGamePath} onStagingDirChange={setConfigStagingDir} onPrefixPathChange={setConfigPrefixPath} onProtonPathChange={setConfigProtonPath} onOpenProtonSwitch={async () => { await gameConfigActions.handleSaveGameConfig(); handleProtonConfigOpen("switch"); }} onSave={gameConfigActions.handleSaveGameConfig} onCancel={() => setShowGameConfig(false)} t={t} />
          </Modal>

          <AddProfileModal open={showAddProfile} onConfirm={async (name) => { await createProfile(name); setShowAddProfile(false); }} onClose={() => setShowAddProfile(false)} />
          <ConflictsModal open={showConflicts} conflicts={conflicts.map(c => ({ file: c.relativePath, mods: c.mods.map(m => m.name) }))} onAutoResolve={() => {}} onClose={() => setShowConflicts(false)} />
          <ConflictDetailsModal open={showConflictDetails} modName={selectedConflictMod?.name ?? ""} conflicts={selectedConflictMod ? (allConflicts?.conflicts ?? []).filter(c => c.mods.some(m => m.name === selectedConflictMod.name)) : []} onApply={handleApplyConflictResolution} onClose={() => { setShowConflictDetails(false); setSelectedConflictMod(null); }} />
          <DeployConfirmModal open={showDeployConfirm} isDeploying={deploying} deployResult={deployResult ? { success: deployResult.success, filesCopied: deployResult.log.length, log: deployResult.log } : null} gamePath={configGamePath} gameId={selectedGame} onConfirm={(_backup, bsaInvalidate) => { setShowDeployConfirm(false); handleDeploy(bsaInvalidate); }} onClose={() => setShowDeployConfirm(false)} />

          <FomodDialog open={showFomod} loading={fomodLoading} steps={filteredSteps ?? []} currentStep={currentStep} installing={fomodInstalling} error={fomodError} onTogglePlugin={handleTogglePlugin} onNextStep={handleNextStep} onPrevStep={handlePrevStep} onInstall={handleInstall} onCancel={handleFomodCancel} onResetSelections={handleResetSelections} />
          <BainDialog open={bain.bainVisible} loading={bain.bainLoading} packages={bain.bainPackages} selected={bain.bainSelected} installing={bain.bainInstalling} error={bain.bainError} onToggle={bain.handleBainToggle} onInstall={bain.handleBainInstall} onCancel={() => bain.setBainVisible(false)} />

          <InstallProgressOverlay stage={installStage} progress={installProgressOrch} canCancel={canCancelInstall} onCancel={cancelOrchInstall} />
          {installResultOrch && <InstallResultOverlay result={installResultOrch} onDismiss={dismissOrchResult} />}

          <PreviewModal open={showPreview} imageUrl={previewCurrentData} modName={previewImages[previewIndex]?.name} onClose={() => setShowPreview(false)} />
          <ReadmeModal open={showReadme} content={readmeData} modName={selectedMod?.name} onClose={() => setShowReadme(false)} />
          <PrefixSetupModal visible={proton.prefixSetupVisible} gameName={proton.prefixSetupGameName} log={proton.prefixSetupLog} result={proton.prefixSetupResult} onClose={() => proton.setPrefixSetupVisible(false)} />
        </>
      )}

      {activeTab === "navegador" && (
        <div className="mod-manager__browser-container">
          <BrowserMirror defaultUrl={DEFAULT_BROWSER_URL} mirrorId="navegador-manager" />
        </div>
      )}
    </div>
  );
}
