import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@renderer/components";
import { BrowserMirror } from "@renderer/components/browser-view";
import type { ModlistEntry } from "./types";
import type { ProtonVersion, ProtonFork } from "@types";

import { useModLog, useMods, useDeploy, useFomod, useMedia, useRightPanel, useModManagerShortcuts, usePlugins, useSplitPane, useInstallMod, useConflictBadges, useSortPlugins } from "./hooks";
import { useInstallOrchestrator } from "./hooks/mods/useInstallOrchestrator";
import { InstallProgressOverlay } from "./components/InstallProgressOverlay";
import { useGameConfig, useProfiles, GamePresetBar } from "../presets";
import { ModListPanel, RightPanel, StatusBar, ModManagerTopBar, ModManagerTabs, GameConfigPanel, GameDetectionWizard, LaunchOverlay } from "./components";
import { ProtonRecommendationModal } from "@provision/proton_recommended/ui/proton-recommendation-modal";
import { AddProfileModal, ConflictsModal, DeployConfirmModal, DeployResultModal, OverwriteModal, PreviewModal, ReadmeModal } from "./components/Modals";
import { ConflictDetailsModal } from "./components/Modals/ConflictDetailsModal";
import { PrefixSetupModal } from "@prefix/wine_prefix/PrefixSetupModal";
import { FomodDialog } from "./components/FomodDialog";
import { BainDialog } from "./components/BainDialog";

import "./ModManager.scss";

type TabId = "mods" | "navegador";

const DEFAULT_BROWSER_URL = "https://www.nexusmods.com";

export default function ModManager() {
  const { t } = useTranslation("mod_manager");

  const [activeTab, setActiveTab] = useState<TabId>("mods");
  const [showProtonSelector, setShowProtonSelector] = useState(false);
  const [installedProtons, setInstalledProtons] = useState<ProtonVersion[]>([]);
  const [launchSteps, setLaunchSteps] = useState<{ key: string; label: string; status: "waiting" | "working" | "done" | "error"; message?: string }[]>([]);
  const [showLaunchOverlay, setShowLaunchOverlay] = useState(false);
  const isLaunching = launchSteps.some(s => s.status === "working");

  const [prefixSetupVisible, setPrefixSetupVisible] = useState(false);
  const [prefixSetupGameName, setPrefixSetupGameName] = useState("");
  const [prefixSetupLog, setPrefixSetupLog] = useState<string[]>([]);
  const [prefixSetupResult, setPrefixSetupResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [showDetectionWizard, setShowDetectionWizard] = useState(false);
  const [healthBanner, setHealthBanner] = useState<{ status: "loading" | "valid" | "issues" | "error"; message: string } | null>(null);

  const { log, addLog } = useModLog();
  const { games, setGames, selectedGame, setSelectedGame, currentGame, showGameConfig, setShowGameConfig, configGamePath, setConfigGamePath, configStagingDir, setConfigStagingDir, configPrefixPath, setConfigPrefixPath, configProtonPath, setConfigProtonPath, saveGameConfig, discoverInstalledGames } = useGameConfig();

  useEffect(() => {
    return window.electron.onModLaunchProgress(data => {
      setLaunchSteps(prev => {
        const idx = prev.findIndex(s => s.key === data.step);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: data.status as any,
            message: data.message,
          };
          return next;
        }
        return prev;
      });
    });
  }, []);
  const { profiles, selectedProfile, setSelectedProfile, createProfile } = useProfiles(selectedGame);
  const { mods, filteredMods, searchQuery, setSearchQuery, mediaMap, selectedModIdx, setSelectedModIdx, loadMods, toggleMod, reorderMods, removeMod, deleteMod, toggleLock, addSeparator, loading } = useMods(selectedGame, selectedProfile);
  const selectedMod = useMemo((): ModlistEntry | null => selectedModIdx !== null ? filteredMods[selectedModIdx] ?? null : null, [selectedModIdx, filteredMods]);

  const filteredModsRef = useRef(filteredMods);
  useEffect(() => { filteredModsRef.current = filteredMods; }, [filteredMods]);

  const handleModInstalled = useCallback((modName: string) => {
    const currentFiltered = filteredModsRef.current;
    const idx = currentFiltered.findIndex(m => m.name === modName);
    if (idx >= 0) setSelectedModIdx(idx);
  }, []);

  const { conflictSet, conflictDetails, allConflicts } = useConflictBadges(mods);
  const { deploying, deployResult, setDeployResult, conflicts, showConflicts, setShowConflicts, showDeployConfirm, setShowDeployConfirm, handleDeploy, detectAndShowConflicts } = useDeploy(selectedGame, selectedProfile, addLog);
  const { showFomod, fomodDir, config, filteredSteps, loading: fomodLoading, error: fomodError, currentStep, installing, selections, openFomod, handleTogglePlugin, handleNextStep, handlePrevStep, handleInstall, handleFomodCancel } = useFomod(addLog, loadMods, selectedGame, handleModInstalled);
  const [bainVisible, setBainVisible] = useState(false);
  const [bainLoading, setBainLoading] = useState(false);
  const [bainPackages, setBainPackages] = useState<{ order: number; name: string; directory: string; file_count: number }[]>([]);
  const [bainSelected, setBainSelected] = useState<Set<number>>(new Set());
  const [bainInstalling, setBainInstalling] = useState(false);
  const [bainError, setBainError] = useState<string | null>(null);
  const [bainArchivePath, setBainArchivePath] = useState("");
  const [bainModName, setBainModName] = useState("");
  const [bainStagingDir, setBainStagingDir] = useState("");
  const handleBainOpen = useCallback(async (modName: string, stagingDir: string, archivePath: string, packages: { order: number; name: string; directory: string; file_count: number }[]) => {
    setBainModName(modName);
    setBainStagingDir(stagingDir);
    setBainArchivePath(archivePath);
    setBainPackages(packages);
    setBainSelected(new Set(packages.map(p => p.order)));
    setBainError(null);
    setBainVisible(true);
  }, []);
  const handleBainToggle = useCallback((order: number) => {
    setBainSelected(prev => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }, []);
  const handleBainInstall = useCallback(async () => {
    if (!bainStagingDir || bainSelected.size === 0) return;
    setBainInstalling(true);
    setBainError(null);
    try {
      const result = await window.electron.bainInstall(bainArchivePath, bainStagingDir, [...bainSelected]);
      if (result.ok) {
        addLog(`BAIN: ${result.data?.packages_installed} packages installed (${result.data?.files_extracted} files)`);
        setBainVisible(false);
        loadMods();
      } else {
        setBainError(result.error || "Install failed");
      }
    } catch (e) {
      setBainError(`Error: ${e}`);
    }
    setBainInstalling(false);
  }, [bainArchivePath, bainStagingDir, bainSelected, addLog, loadMods]);
  // useInstallMod — apenas para OverwriteModal (será removido quando orquestrador tiver overwrite check)
  const { showOverwriteModal, pendingMod, confirmOverwrite, cancelOverwrite } = useInstallMod(selectedGame, selectedProfile, addLog, openFomod, loadMods, handleModInstalled, handleBainOpen);
  const { showPreview, setShowPreview, previewImages, previewIndex, previewCurrentData, showReadme, setShowReadme, readmeData, openPreview, openReadme } = useMedia();
  const { activeRightTab, setActiveRightTab, modFiles, iniFiles, selectedIni, setSelectedIni, iniContent, setIniContent, dataFiles, excludedFiles, toggleExcludedFile } = useRightPanel(selectedMod, selectedGame);
  const { plugins, togglePlugin } = usePlugins(selectedGame, selectedProfile, mods);
  const { sorting, sortWarnings, handleSortPlugins } = useSortPlugins(selectedGame, plugins, mods, addLog);

  // Install Orchestrator — novo sistema de instalação com verificação
  const {
    stage: installStage,
    progress: installProgressOrch,
    result: installResultOrch,
    isInstalling: isOrchInstalling,
    canCancel: canCancelInstall,
    startInstall: startOrchInstall,
    cancel: cancelOrchInstall,
    dismissResult: dismissOrchResult,
    stageLabel: installStageLabel,
    stagePercent: installStagePercent,
    elapsedTime: installElapsedTime,
  } = useInstallOrchestrator(selectedGame, selectedProfile, configStagingDir, addLog, loadMods);

  // Wrapper: abre file dialog → chama orquestrador
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
      await startOrchInstall(result.filePaths[0]);
    } catch (err) {
      addLog(`Erro ao selecionar arquivo: ${String(err)}`);
    }
  }, [startOrchInstall, addLog, t]);

  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  const [selectedConflictMod, setSelectedConflictMod] = useState<ModlistEntry | null>(null);

  const handleConflictClick = useCallback((mod: ModlistEntry) => {
    setSelectedConflictMod(mod);
    setShowConflictDetails(true);
  }, []);

  const handleApplyConflictResolution = useCallback((deselectedMods: string[]) => {
    // Deselect the mods that were chosen in the conflict modal
    for (const modName of deselectedMods) {
      const idx = mods.findIndex(m => m.name === modName);
      if (idx !== -1 && mods[idx].enabled) {
        toggleMod(idx);
      }
    }
    setShowConflictDetails(false);
    setSelectedConflictMod(null);
  }, [mods, toggleMod]);

  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const anyEnabled = mods.some(m => m.enabled);
  const modsActive = mods.filter(m => m.enabled).length;

  const handleSaveGameConfig = useCallback(async () => {
    if (!selectedGame) {
      const gameName = prompt("Enter game name:") || "";
      if (!gameName) return;
      await saveGameConfig(gameName, configGamePath, configStagingDir);
      setGames(prev => [...prev, { name: gameName, gameId: gameName, path: configGamePath }]);
      setSelectedGame(gameName);
    } else {
      await saveGameConfig(selectedGame, configGamePath, configStagingDir);
      const g = games.find(x => (x.gameId || x.name) === selectedGame);
      addLog(`Saved config for ${g?.name || selectedGame}`);
    }
    setShowGameConfig(false);
  }, [selectedGame, configGamePath, configStagingDir, saveGameConfig, setGames, setSelectedGame, addLog, setShowGameConfig]);

  const handleDetectionWizardGame = useCallback(async (gameId: string, gamePath: string) => {
    const slug = gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
    const homeDir = await window.electron.getHomeDir();
    const home = homeDir || "/home/" + (process.env.USER || "user");
    const staging = home + "/Games/Mods/" + slug + "/staging";
    const prefix = home + "/Games/Prefix/" + slug;
    setConfigStagingDir(staging);
    setConfigPrefixPath(prefix);
    await window.electron.saveGameConfig(gameId, {
      gamePath,
      stagingDir: staging,
      protonPrefix: prefix,
      protonVersion: "",
    });
    setSelectedGame(gameId);
    setConfigGamePath(gamePath);
    addLog(`Jogo detectado: ${gameId} em ${gamePath}`);
  }, [setSelectedGame, setConfigGamePath, setConfigStagingDir, setConfigPrefixPath, addLog]);

  useEffect(() => {
    if (!selectedGame || !configGamePath) return;
    let cancelled = false;
    (async () => {
      setHealthBanner({ status: "loading", message: "Verificando prefixo..." });
      try {
        const result = await window.electron.prefixHealthCheck(selectedGame);
        if (cancelled) return;
        if (result.ok && result.data) {
          if (result.data.valid) {
            setHealthBanner({ status: "valid", message: "Prefixo configurado corretamente" });
          } else if (result.data.errors.length > 0) {
            setHealthBanner({ status: "error", message: `Problemas: ${result.data.errors.join("; ")}` });
          } else {
            setHealthBanner({ status: "issues", message: "Algumas configurações precisam de atenção" });
          }
        } else {
          setHealthBanner({ status: "error", message: result.error || "Falha ao verificar prefixo" });
        }
      } catch {
        if (!cancelled) setHealthBanner({ status: "error", message: "Erro ao verificar saúde do prefixo" });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGame, configGamePath]);

  useEffect(() => {
    if (healthBanner?.status !== "valid") return;
    const timer = setTimeout(() => setHealthBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [healthBanner]);

  const handleDiscover = useCallback(async () => {
    const count = await discoverInstalledGames();
    if (count > 0) addLog(`Discovered ${count} game(s)`);
  }, [discoverInstalledGames, addLog]);

  useEffect(() => {
    if (showProtonSelector && selectedGame) {
      window.electron.getInstalledProtonVersions().then(setInstalledProtons).catch(() => setInstalledProtons([]));
    }
  }, [showProtonSelector, selectedGame]);

  const setupProton = useCallback(async (gameName: string, protonPath: string) => {
    setPrefixSetupGameName(gameName);
    setPrefixSetupLog([`▶ Configurando ambiente Proton para ${gameName}...`]);
    setPrefixSetupResult(null);
    setPrefixSetupVisible(true);
    const cleanup = window.electron.onProtonSetupLog((line: string) => {
      setPrefixSetupLog(prev => [...prev, line]);
    });
    try {
      const prefixPath = configPrefixPath || "";
      const result = await window.electron.setupProtonEnvironment(gameName, protonPath, prefixPath, true);
      if (result.success) {
        setPrefixSetupLog(prev => [...prev, "", "✅ Ambiente Proton configurado com sucesso!"]);
        setPrefixSetupResult({ ok: true, msg: "✅ Configuração concluída!" });
      } else {
        setPrefixSetupLog(prev => [...prev, "", "❌ Configuração do Proton falhou"]);
        setPrefixSetupResult({ ok: false, msg: "❌ Configuração do Proton falhou" });
      }
    } catch (err) {
      setPrefixSetupLog(prev => [...prev, `❌ Erro: ${String(err)}`]);
      setPrefixSetupResult({ ok: false, msg: `Erro: ${String(err)}` });
    } finally {
      cleanup();
    }
  }, [configPrefixPath]);

  const saveGlobalProton = useCallback(async (protonPath: string) => {
    await window.electron.modsStore.put("proton_binary", protonPath);
    addLog(`Proton global salvo: ${protonPath}`);
  }, [addLog]);

  const handleProtonSelect = useCallback(async (protonPath: string) => {
    if (!selectedGame) return;
    setConfigProtonPath(protonPath);
    await saveGameConfig(selectedGame, configGamePath, configStagingDir);
    await saveGlobalProton(protonPath);
    addLog(`Proton salvo na config: ${protonPath}`);
    // Now prepare the environment (clean prefix + recreate + apply configs)
    await setupProton(selectedGame, protonPath);
  }, [selectedGame, configGamePath, configStagingDir, saveGameConfig, setConfigProtonPath, addLog, setupProton, saveGlobalProton]);

  const handleDownloadAndSelect = useCallback(async (fork: ProtonFork) => {
    if (!selectedGame) return;

    const protonPath = await window.electron.downloadProton(fork);
    if (!protonPath) {
      addLog(`Falha ao baixar ${fork.name} ${fork.version}`);
      return;
    }

    setConfigProtonPath(protonPath);
    await saveGameConfig(selectedGame, configGamePath, configStagingDir);
    await saveGlobalProton(protonPath);
    addLog(`Proton baixado: ${protonPath}`);

    const info = await window.electron.getModGameInfo(selectedGame);
    const steamAppId = info?.steamAppId;
    if (steamAppId) {
      const protonName = protonPath.replace(/\/+$/, '').split(/[\\/]/).pop() || '';
      if (protonName) {
        await window.electron.setSteamGameProton(steamAppId, protonName);
        addLog(`Steam configurado: ${selectedGame} → ${protonName}`);
      }
    }

    // Now prepare the environment (clean prefix + recreate + apply configs)
    await setupProton(selectedGame, protonPath);
  }, [selectedGame, configGamePath, configStagingDir, saveGameConfig, setConfigProtonPath, addLog, setupProton, saveGlobalProton]);

  const handleLaunchClick = useCallback(() => {
    if (!selectedGame) return;
    const displayName = currentGame?.name || selectedGame;
    setLaunchSteps([
      { key: "detect", label: "Detectando jogo", status: "working" },
      { key: "proton", label: "Verificando Proton", status: "waiting" },
      { key: "prefix", label: "Verificando prefixo", status: "waiting" },
      { key: "dll", label: "Configurando DLL Overrides", status: "waiting" },
      { key: "registry", label: "Registro do jogo", status: "waiting" },
      { key: "deploy", label: "Implantando mods", status: "waiting" },
      { key: "skse", label: "Verificando SKSE", status: "waiting" },
      { key: "launch", label: "Iniciando jogo", status: "waiting" },
    ]);
    setShowLaunchOverlay(true);

    window.electron.modPlayGame(selectedGame, selectedProfile).then(result => {
      if (result.success) {
        addLog(`✅ ${displayName} iniciado via ${result.method}`);
      } else {
        addLog(`❌ ${result.error || "Falha ao iniciar"}`);
      }
      setTimeout(() => {
        setShowLaunchOverlay(false);
        setLaunchSteps([]);
      }, 2000);
    }).catch(e => {
      addLog(`❌ Erro: ${e}`);
      setTimeout(() => {
        setShowLaunchOverlay(false);
        setLaunchSteps([]);
      }, 2000);
    });
  }, [selectedGame, selectedProfile, currentGame, addLog]);

  const handleRemoveMod = useCallback(() => {
    if (selectedModIdx === null || !filteredMods[selectedModIdx]) return;
    const modName = filteredMods[selectedModIdx].name;
    if (!window.confirm(`Remove "${modName}"?`)) return;
    addLog(`Removing mod: ${modName}`);
    removeMod(modName);
    setSelectedModIdx(null);
    addLog(`Removed: ${modName}. Re-deploy to apply.`);
  }, [selectedModIdx, filteredMods, addLog, removeMod, setSelectedModIdx]);

  const handleDeleteMod = useCallback((modName: string) => {
    if (!window.confirm(`Permanently delete "${modName}"? This will remove staging files.`)) return;
    addLog(`Deleting mod: ${modName}`);
    deleteMod(modName);
    setSelectedModIdx(null);
    addLog(`Deleted: ${modName}.`);
  }, [addLog, deleteMod]);

  const handleEslify = useCallback(async (modName: string) => {
    if (!selectedGame) return;
    const mod = mods.find(m => m.name === modName);
    if (!mod?.stagingDir) {
      addLog(`Cannot ESLify: no staging dir for ${modName}`);
      return;
    }
    const espPlugins = mod.plugins?.filter(p => p.toLowerCase().endsWith(".esp")) || [];
    if (espPlugins.length === 0) {
      addLog(`${modName}: no .esp plugins to ESLify`);
      return;
    }
    addLog(`ESLifying ${modName}...`);
    for (const plugin of espPlugins) {
      const pluginPath = `${mod.stagingDir}/${plugin}`;
      try {
        const result = await window.electron.eslify(pluginPath, false, true);
        if (result.success) {
          addLog(`  ✅ ${plugin} → ESL (safe: ${result.safe})`);
        } else {
          addLog(`  ❌ ${plugin}: ${result.error || "failed"}`);
        }
      } catch (e) {
        addLog(`  ❌ ${plugin}: ${e}`);
      }
    }
  }, [selectedGame, mods, addLog]);

  const handleDeployClick = useCallback(async () => {
    detectAndShowConflicts(mods.filter(m => m.enabled && !m.isSeparator).map((m, i) => ({ name: m.name, priority: m.priority ?? i })));
  }, [mods, detectAndShowConflicts]);

  const { onDividerMouseDown } = useSplitPane(containerRef);

  useModManagerShortcuts({
    selectedModIdx,
    filteredMods,
    onSearchFocus: () => searchRef.current?.focus(),
    onDeploy: handleDeploy,
    onRemoveMod: (name: string) => { removeMod(name); setSelectedModIdx(null); },
    onDeselect: () => setSelectedModIdx(null),
  });

  return (
    <div className="mod-manager">
      {showLaunchOverlay && (
        <LaunchOverlay
          gameName={currentGame?.name || selectedGame}
          steps={launchSteps}
          onCancel={() => setShowLaunchOverlay(false)}
        />
      )}

      <ProtonRecommendationModal
        visible={showProtonSelector}
        gameId={selectedGame!}
        gameTitle={currentGame?.name || selectedGame || ""}
        installedProtons={installedProtons}
        onClose={() => setShowProtonSelector(false)}
        onSelect={handleProtonSelect}
        onDownloadAndSelect={handleDownloadAndSelect}
      />

      <ModManagerTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "mods" && (
        <>
          <div className="mod-manager__topbar">
            <div className="mod-manager__topbar-left">
              <GamePresetBar
                games={games}
                selectedGame={selectedGame}
                profiles={profiles}
                selectedProfile={selectedProfile}
                onGameChange={(g) => { setSelectedGame(g); setSelectedModIdx(null); }}
                onProfileChange={setSelectedProfile}
                onGameConfig={() => setShowGameConfig(true)}
                onAddProfile={() => setShowAddProfile(true)}
                onDetectGames={() => setShowDetectionWizard(true)}
              />
            </div>
            <ModManagerTopBar
              deploying={deploying}
              installing={isOrchInstalling}
              launching={isLaunching}
              hasGame={!!selectedGame}
              selectedModIdx={selectedModIdx}
              t={t}
              onInstallMod={() => pickAndOrchInstall()}
              onDeploy={handleDeployClick}
              onLaunchGame={handleLaunchClick}
              onProtonConfig={() => setShowProtonSelector(true)}
              onRefresh={() => { loadMods(); addLog(t("refresh")); }}
              onRemoveMod={handleRemoveMod}
            />
          </div>

          {healthBanner && healthBanner.status !== "loading" && (
            <div className={`mod-manager__health-banner mod-manager__health-banner--${healthBanner.status}`}>
              {healthBanner.status === "valid" && "✅ "}
              {healthBanner.status === "issues" && "⚠️ "}
              {healthBanner.status === "error" && "❌ "}
              {healthBanner.message}
              {healthBanner.status !== "valid" && (
                <button className="mod-manager__health-banner-fix" onClick={() => setShowGameConfig(true)}>
                  Configurar
                </button>
              )}
            </div>
          )}
          <GameDetectionWizard
            open={showDetectionWizard}
            onClose={() => setShowDetectionWizard(false)}
            onGameDetected={handleDetectionWizardGame}
            selectedGameId={selectedGame || undefined}
          />
          <div className="mod-manager__main" ref={containerRef}>
            <div className="mod-manager__left">
              <ModListPanel
                mods={filteredMods}
                selectedMod={selectedMod}
                searchQuery={searchQuery}
                mediaCache={mediaMap}
                loading={loading}
                searchRef={searchRef}
                conflicts={conflictSet}
                conflictDetails={conflictDetails}
                onToggle={(idx) => toggleMod(idx)}
                onSelect={(mod) => {
                  if (!mod) { setSelectedModIdx(null); return; }
                  const currentFiltered = filteredModsRef.current;
                  const idx = currentFiltered.findIndex(m => m.name === mod.name);
                  if (idx === -1) return;
                  setSelectedModIdx(prev => prev === idx ? null : idx);
                }}
                onSearch={setSearchQuery}
                onReorder={(from, to) => reorderMods(from, to)}
                onPreview={(mod) => openPreview(mod.stagingDir)}
                onReadme={(mod) => openReadme(mod.stagingDir)}
                onLock={(idx) => toggleLock(idx)}
                onAddSeparator={(idx) => addSeparator(idx)}
                onRemoveMod={(name) => { removeMod(name); setSelectedModIdx(null); }}
                onDeleteMod={handleDeleteMod}
                onEslify={handleEslify}
                onConflictClick={handleConflictClick}
              />
            </div>

            <div className="mod-manager__divider" onMouseDown={onDividerMouseDown} />

            <div className="mod-manager__right">
              <RightPanel
                selectedMod={selectedMod}
                plugins={plugins}
                modFiles={modFiles ?? []}
                excludedFiles={excludedFiles}
                dataFolderEntries={dataFiles}
                iniFiles={iniFiles}
                selectedIni={selectedIni}
                iniContent={iniContent}
                activeRightTab={activeRightTab}
                onTabChange={setActiveRightTab}
                onTogglePlugin={togglePlugin}
                onToggleExclude={toggleExcludedFile}
                onIniSelect={(path, content) => { setSelectedIni(path); setIniContent(content); }}
                onIniChange={setIniContent}
              />
            </div>
          </div>

          <StatusBar log={log} modsTotal={mods.length} modsActive={modsActive} />
          {sortWarnings.length > 0 && (
            <div className="mod-manager__sort-warnings">
              {sortWarnings.map((w, i) => <p key={i} className="mod-manager__sort-warning">{w}</p>)}
            </div>
          )}

          <OverwriteModal
            open={showOverwriteModal}
            modName={pendingMod?.modName}
            onConfirm={confirmOverwrite}
            onCancel={cancelOverwrite}
          />

          <DeployResultModal
            open={deployResult !== null}
            result={deployResult}
            onClose={() => setDeployResult(null)}
          />

          <Modal visible={showGameConfig} title={t("configure_game_title", { name: currentGame?.name || selectedGame })} onClose={() => setShowGameConfig(false)}>
            <GameConfigPanel
              open={showGameConfig}
              selectedGame={selectedGame}
              configGamePath={configGamePath}
              configStagingDir={configStagingDir}
              configPrefixPath={configPrefixPath}
              configProtonPath={configProtonPath}
              onGamePathChange={setConfigGamePath}
              onStagingDirChange={setConfigStagingDir}
              onPrefixPathChange={setConfigPrefixPath}
              onProtonPathChange={setConfigProtonPath}
              onSave={handleSaveGameConfig}
              onCancel={() => setShowGameConfig(false)}
              t={t}
            />
          </Modal>

        <AddProfileModal open={showAddProfile} onConfirm={async (name) => { await createProfile(name); setShowAddProfile(false); }} onClose={() => setShowAddProfile(false)} />

        <ConflictsModal open={showConflicts} conflicts={conflicts.map(c => ({ file: c.relativePath, mods: c.mods.map(m => m.name) }))} onAutoResolve={() => {}} onClose={() => setShowConflicts(false)} />

        <ConflictDetailsModal
          open={showConflictDetails}
          modName={selectedConflictMod?.name ?? ""}
          conflicts={selectedConflictMod ? (allConflicts?.conflicts ?? []).filter(c => c.mods.some(m => m.name === selectedConflictMod.name)) : []}
          onApply={handleApplyConflictResolution}
          onClose={() => { setShowConflictDetails(false); setSelectedConflictMod(null); }}
        />

        <DeployConfirmModal open={showDeployConfirm} isDeploying={deploying} deployResult={deployResult ? { success: deployResult.success, filesCopied: deployResult.log.length, log: deployResult.log } : null} gamePath={configGamePath} gameId={selectedGame} onConfirm={(_backup, bsaInvalidate) => { setShowDeployConfirm(false); handleDeploy(bsaInvalidate); }} onClose={() => setShowDeployConfirm(false)} />

        <FomodDialog
          open={showFomod}
          loading={fomodLoading}
          steps={filteredSteps ?? []}
          currentStep={currentStep}
          installing={installing}
          error={fomodError}
          onTogglePlugin={handleTogglePlugin}
          onNextStep={handleNextStep}
          onPrevStep={handlePrevStep}
          onInstall={handleInstall}
          onCancel={handleFomodCancel}
        />

        <BainDialog
          open={bainVisible}
          loading={bainLoading}
          packages={bainPackages}
          selected={bainSelected}
          installing={bainInstalling}
          error={bainError}
          onToggle={handleBainToggle}
          onInstall={handleBainInstall}
          onCancel={() => setBainVisible(false)}
        />

        {/* Novo overlay de instalação com orquestrador */}
        <InstallProgressOverlay
          stage={installStage}
          progress={installProgressOrch}
          canCancel={canCancelInstall}
          onCancel={cancelOrchInstall}
        />

        {/* Overlay de resultado */}
        {installResultOrch && (
          <div className="install-overlay">
            <div className="install-overlay__box">
              <p className={`install-overlay__title ${installResultOrch.success ? "install-overlay__title--ok" : "install-overlay__title--err"}`}>
                {installResultOrch.success ? `✓ ${t("install_complete")}` : `✗ ${t("install_error")}`}
              </p>
              <p className="install-overlay__message">
                {installResultOrch.success
                  ? `"${installResultOrch.modName}" ${t("install_complete").toLowerCase()}.`
                  : installResultOrch.error}
              </p>
              {installResultOrch.success && (
                <p className="install-overlay__details">
                  {installResultOrch.extractedFiles.length} {t("files")}
                  {installResultOrch.verified && ` • ${t("verified")}`}
                  {installResultOrch.plugins.length > 0 && ` • ${installResultOrch.plugins.length} plugins`}
                </p>
              )}
              <button
                className="install-overlay__btn"
                onClick={dismissOrchResult}
              >
                OK
              </button>
            </div>
          </div>
        )}

        <PreviewModal open={showPreview} imageUrl={previewCurrentData} modName={previewImages[previewIndex]?.name} onClose={() => setShowPreview(false)} />

        <ReadmeModal open={showReadme} content={readmeData} modName={selectedMod?.name} onClose={() => setShowReadme(false)} />

        <PrefixSetupModal
          visible={prefixSetupVisible}
          gameName={prefixSetupGameName}
          log={prefixSetupLog}
          result={prefixSetupResult}
          onClose={() => setPrefixSetupVisible(false)}
        />
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
