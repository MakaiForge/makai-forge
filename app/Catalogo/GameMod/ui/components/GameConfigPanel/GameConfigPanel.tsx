import { Button } from "@components";
import { useState, useEffect, useCallback } from "react";
import { useGameDllCatalog } from "../../../presets/useGameDllCatalog";
import type { InstalledProtonTool } from "../../types/proton.types";
import "./GameConfigPanel.scss";

interface ScanResult {
  gamePath: string;
  gamePathExists: boolean;
  prefixPath: string | null;
  prefixValid: boolean;
  protonPath: string;
  protonExists: boolean;
  dllOverridesOk: boolean;
  dllOverridesMissing: string[];
  registryOk: boolean;
  skseInstalled: boolean;
  skseName: string;
  frameworks: { name: string; installed: boolean }[];
  depsInstalled: string[];
  depsMissing: string[];
  ready: boolean;
  errors: string[];
  fixed: string[];
}

interface GameConfigPanelProps {
  open: boolean;
  selectedGame: string | null;
  configGamePath: string;
  configStagingDir: string;
  configPrefixPath: string;
  configProtonPath: string;
  originalProtonPath?: string;
  onGamePathChange: (path: string) => void;
  onStagingDirChange: (path: string) => void;
  onPrefixPathChange: (path: string) => void;
  onProtonPathChange: (path: string) => void;
  onOpenProtonSwitch?: () => void;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}

export function GameConfigPanel({
  open, selectedGame, configGamePath, configStagingDir, configPrefixPath, configProtonPath,
  originalProtonPath,
  onGamePathChange, onStagingDirChange, onPrefixPathChange, onProtonPathChange,
  onOpenProtonSwitch,
  onSave, onCancel, t,
}: GameConfigPanelProps) {
  if (!open) return null;

  const { catalog, getGameInfo } = useGameDllCatalog();
  const gameInfo = selectedGame ? getGameInfo(selectedGame) : undefined;

  const [health, setHealth] = useState<ScanResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [installingDep, setInstallingDep] = useState<string | null>(null);
  const [preparingPrefix, setPreparingPrefix] = useState(false);
  const [prefixPrepResult, setPrefixPrepResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [installedProtons, setInstalledProtons] = useState<InstalledProtonTool[]>([]);
  const [showCustomProton, setShowCustomProton] = useState(false);

  const runHealthCheck = useCallback(async () => {
    if (!selectedGame) return;
    setHealthLoading(true);
    setHealth(null);
    try {
      const env = await (window.electron as any).scanEnvironment(selectedGame, true);
      if (env) setHealth(env);
    } catch { /* ignore */ }
    setHealthLoading(false);
  }, [selectedGame]);

  const handleAutoFix = async () => {
    if (!selectedGame) return;
    setFixing(true);
    try {
      const env = await (window.electron as any).scanEnvironment(selectedGame, true);
      if (env) {
        setHealth(env);
        if (env.fixed?.length > 0) {
          await runHealthCheck();
        }
      }
    } catch (err) { /* ignore */ }
    setFixing(false);
  };

  /** Mapeia autoInstallDeps (catálogo) para verbs do Makaitricks */
  const depToVerb = (dep: string): string => {
    const map: Record<string, string> = {
      vcredist: "vcrun2022",
      d3dcompiler_47: "d3dcompiler_47",
      dxvk: "dxvk",
    };
    return map[dep] || dep;
  };

  const handleInstallDep = async (dep: string) => {
    if (!selectedGame) return;
    setInstallingDep(dep);
    try {
      const verb = depToVerb(dep);
      await window.electron.installGameDlls(selectedGame, [verb]);
      await runHealthCheck();
    } catch { /* ignore */ }
    setInstallingDep(null);
  };

  const handlePreparePrefix = async () => {
    if (!selectedGame) return;
    setPreparingPrefix(true);
    setPrefixPrepResult(null);
    try {
      const result = await window.electron.createModPrefix(selectedGame);
      if (result.ok) {
        setPrefixPrepResult({ ok: true, msg: "Prefixo criado/configurado com sucesso!" });
        await runHealthCheck();
      } else {
        setPrefixPrepResult({ ok: false, msg: result.error || "Falha ao criar prefixo" });
      }
    } catch (err) {
      setPrefixPrepResult({ ok: false, msg: `Erro: ${String(err)}` });
    }
    setPreparingPrefix(false);
  };

  const protonChanged = originalProtonPath !== undefined && configProtonPath !== originalProtonPath && configProtonPath.trim() !== "";

  const handleDetect = async () => {
    if (!selectedGame) return;
    const res = await window.electron.showOpenDialog({ properties: ["openDirectory"] });
    if (!res.canceled && res.filePaths[0]) {
      const detectResult = await window.electron.detectGameManual(selectedGame, res.filePaths[0]);
      if (detectResult.ok && detectResult.data) {
        onGamePathChange(detectResult.data.gamePath);
        onStagingDirChange(detectResult.data.stagingDir);
        onPrefixPathChange(detectResult.data.protonPrefix);
      }
    }
  };

  useEffect(() => {
    if (open) {
      window.electron.getInstalledProtonTools().then((result) => {
        setInstalledProtons(result as InstalledProtonTool[]);
      });
    }
  }, [open]);

  const knownProtonPaths = installedProtons.map(p => p.path);
  const selectedInKnown = configProtonPath && knownProtonPaths.includes(configProtonPath) ? configProtonPath : "";
  const isCustomProton = configProtonPath !== "" && !selectedInKnown;

  useEffect(() => {
    if (open && selectedGame && configGamePath) {
      runHealthCheck();
    }
  }, [open, selectedGame, configGamePath, runHealthCheck]);

  useEffect(() => {
    setShowCustomProton(isCustomProton);
  }, [isCustomProton]);

  const healthColor = !health ? "" : health.ready ? "green" : health.errors.length > 0 ? "red" : "yellow";

  return (
    <div className="mod-manager__config-form">
      <label>{t("game_path_label")}</label>
      <div className="mod-manager__config-row">
        <input value={configGamePath} onChange={e => onGamePathChange(e.target.value)} placeholder={t("game_path_placeholder")} />
        <button className="mod-manager__topbar-btn" onClick={handleDetect}>{t("browse")}</button>
      </div>

      <label>{t("staging_dir_label")}</label>
      <div className="mod-manager__config-row">
        <input value={configStagingDir} onChange={e => onStagingDirChange(e.target.value)} placeholder={t("staging_dir_placeholder")} />
        <button className="mod-manager__topbar-btn" onClick={async () => {
          const res = await window.electron.showOpenDialog({ properties: ["openDirectory"] });
          if (!res.canceled && res.filePaths[0]) onStagingDirChange(res.filePaths[0]);
        }}>{t("browse")}</button>
      </div>

      <div className="mod-manager__config-section">
        <label>Proton</label>
        <label>Prefix path</label>
        <div className="mod-manager__config-row">
          <input value={configPrefixPath} onChange={e => onPrefixPathChange(e.target.value)} placeholder="~/Games/Prefix/..." />
          <button className="mod-manager__topbar-btn" onClick={async () => {
            const res = await window.electron.showOpenDialog({ properties: ["openDirectory"] });
            if (!res.canceled && res.filePaths[0]) onPrefixPathChange(res.filePaths[0]);
          }}>{t("browse")}</button>
        </div>
        <label>Proton version</label>
        <select
          value={selectedInKnown || "__custom__"}
          onChange={e => {
            if (e.target.value === "__custom__") {
              setShowCustomProton(true);
              onProtonPathChange("");
            } else {
              setShowCustomProton(false);
              onProtonPathChange(e.target.value);
            }
          }}
          className="mod-manager__config-select"
        >
          <option value="">Auto (deixar vazio)</option>
          {installedProtons.map(p => (
            <option key={p.path} value={p.path}>{p.version} — {p.path}</option>
          ))}
          <option value="__custom__">Outro...</option>
        </select>

        {showCustomProton && (
          <input value={configProtonPath} onChange={e => onProtonPathChange(e.target.value)} placeholder="/path/to/proton customizado" />
        )}

        {protonChanged && onOpenProtonSwitch && (
          <div className="mod-manager__config-switch-proton">
            <p className="mod-manager__config-switch-warning">
              ⚠️ Proton diferente detectado. Trocar recria o prefixo (saves são preservados).
            </p>
            <Button
              onClick={onOpenProtonSwitch}
              theme="primary"
              className="mod-manager__config-switch-btn"
            >
              Trocar Proton (Selecionar e Recriar Prefixo)
            </Button>
          </div>
        )}
      </div>

      {configGamePath && (
        <div className="mod-manager__config-health">
          <label>Status do Prefixo</label>
          {healthLoading ? (
            <p className="mod-manager__config-health-loading">Verificando...</p>
          ) : health ? (
            <div className={`mod-manager__config-health-banner mod-manager__config-health-banner--${healthColor}`}>
              <p><strong>Prefixo:</strong> {health.prefixValid ? "✅ Válido" : "❌ Inválido"}</p>
              <p><strong>DLL Overrides:</strong> {health.dllOverridesOk ? "✅ OK" : `❌ Faltando: ${health.dllOverridesMissing.join(", ")}`}</p>
              {health.skseName && (
                <p><strong>{health.skseName}:</strong> {health.skseInstalled ? "✅ Instalado" : "❌ Não encontrado"}</p>
              )}
              {health.frameworks.length > 0 && health.frameworks.map(fw => (
                <p key={fw.name}><strong>{fw.name}:</strong> {fw.installed ? "✅" : "❌"}</p>
              ))}
              {health.errors.length > 0 && (
                <div className="mod-manager__config-health-errors">
                  {health.errors.map((e, i) => <p key={i} className="mod-manager__config-health-error">⚠️ {e}</p>)}
                </div>
              )}
              {!health.ready && (
                <Button onClick={handleAutoFix} disabled={fixing} theme="primary" className="mod-manager__config-fix-btn">
                  {fixing ? "Corrigindo..." : "Reparar Prefixo"}
                </Button>
              )}
              {health.fixed && health.fixed.length > 0 && (
                <div className="mod-manager__config-fix-result">
                  {health.fixed.map((r: string, i: number) => <p key={i}>✅ {r}</p>)}
                </div>
              )}
              <Button
                onClick={handlePreparePrefix}
                disabled={preparingPrefix}
                theme="secondary"
                className="mod-manager__config-prepare-btn"
              >
                {preparingPrefix ? "Preparando..." : "Preparar Prefixo"}
              </Button>
              {prefixPrepResult && (
                <div className={`mod-manager__config-prepare-result ${prefixPrepResult.ok ? "--ok" : "--fail"}`}>
                  {prefixPrepResult.ok ? "✅ " : "❌ "}{prefixPrepResult.msg}
                </div>
              )}
            </div>
          ) : (
            <p className="mod-manager__config-health-empty">Clique em "Salvar" primeiro ou selecione o diretório do jogo</p>
          )}
        </div>
      )}

      {gameInfo && gameInfo.wineDllOverrides && Object.keys(gameInfo.wineDllOverrides).length > 0 && (
        <div className="mod-manager__config-dlls">
          <label>DLL Overrides ({Object.keys(gameInfo.wineDllOverrides).length})</label>
          <div className="mod-manager__config-dll-list">
            {Object.entries(gameInfo.wineDllOverrides).map(([dll, mode]) => (
              <div key={dll} className="mod-manager__config-dll-item">
                <span className="mod-manager__config-dll-name">{dll}.dll</span>
                <span className="mod-manager__config-dll-mode">{mode}</span>
                {health?.dllOverridesMissing.includes(dll) ? (
                  <span className="mod-manager__config-dll-status mod-manager__config-dll-status--missing">❌</span>
                ) : health?.dllOverridesOk ? (
                  <span className="mod-manager__config-dll-status mod-manager__config-dll-status--ok">✅</span>
                ) : null}
              </div>
            ))}
          </div>
          {gameInfo.wineDllOverridesRange && Object.keys(gameInfo.wineDllOverridesRange).length > 0 && (
            <div className="mod-manager__config-dll-range">
              <p>Ranges:</p>
              {Object.entries(gameInfo.wineDllOverridesRange).map(([prefix2, r]) => (
                <p key={prefix2} className="mod-manager__config-dll-range-item">
                  {prefix2}[{r.start}-{r.end}] → {r.mode}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {gameInfo?.autoInstallDeps && gameInfo.autoInstallDeps.length > 0 && (
        <div className="mod-manager__config-deps">
          <label>Dependências</label>
          <div className="mod-manager__config-deps-list">
            {gameInfo.autoInstallDeps.map(dep => {
              const installed = health?.depsInstalled.includes(dep);
              const missing = health?.depsMissing.includes(dep);
              return (
                <div key={dep} className="mod-manager__config-dep-item">
                  <span>{dep}</span>
                  {installed && <span className="mod-manager__config-dep-status--ok">✅ Instalado</span>}
                  {missing && <span className="mod-manager__config-dep-status--missing">❌ Ausente</span>}
                  <Button onClick={() => handleInstallDep(dep)} disabled={installingDep === dep || installed}>
                    {installingDep === dep ? "Instalando..." : "Instalar"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gameInfo?.scriptExtender && (
        <div className="mod-manager__config-se">
          <label>Script Extender: {gameInfo.scriptExtender.name}</label>
          <div className="mod-manager__config-se-info">
            <p>Loader: {gameInfo.scriptExtender.loaderExe}</p>
            <p>Status: {health?.skseInstalled ? "✅ Instalado" : "❌ Não encontrado"}</p>
            {!health?.skseInstalled && (
              <Button onClick={async () => {
                if (!selectedGame || !configGamePath) return;
                const result = await window.electron.seInstall(selectedGame, configGamePath);
                if (result.ok) await runHealthCheck();
              }}>Baixar & Instalar</Button>
            )}
          </div>
        </div>
      )}

      {gameInfo?.frameworks && Object.keys(gameInfo.frameworks).length > 0 && (
        <div className="mod-manager__config-frameworks">
          <label>Frameworks ({Object.keys(gameInfo.frameworks).length})</label>
          <div className="mod-manager__config-framework-list">
            {Object.entries(gameInfo.frameworks).map(([name, file]) => {
              const installed = health?.frameworks.find(f => f.name === name)?.installed;
              return (
                <div key={name} className="mod-manager__config-framework-item">
                  <span>{name}</span>
                  <span>{file}</span>
                  <span>{installed ? "✅" : "❌"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mod-manager__config-actions">
        <Button theme="primary" onClick={onSave}>{t("save")}</Button>
        <Button onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
