import { useState, useEffect, useCallback, useMemo } from "react";
import { Modal, Button } from "@components";
import type { ProtonVersion, ProtonFork } from "@types";
import "./proton-recommendation-modal.scss";

const TIER_COLORS: Record<string, string> = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
  platinum: "#E5E4E2",
};

const TIER_BG_COLORS: Record<string, string> = {
  gold: "rgba(255, 215, 0, 0.15)",
  silver: "rgba(192, 192, 192, 0.15)",
  bronze: "rgba(205, 127, 50, 0.15)",
  platinum: "rgba(229, 228, 226, 0.15)",
};

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "Alta", color: "#27ae60" },
  medium: { label: "Média", color: "#f39c12" },
  low: { label: "Baixa", color: "#e74c3c" },
  genérico: { label: "Palpite (tierScore)", color: "#888" },
};

const FORK_ALIAS: Record<string, string> = {
  "ge-proton": "proton-ge",
};

const PROTON_TO_FORK_ID: Record<string, string> = {
  "proton-ge": "ge-proton",
  "dw-proton": "dw-proton",
  "proton-cachyos": "proton-cachyos",
  "proton-em": "proton-em",
  "proton-ge-rtsp": "proton-ge-rtsp",
  "proton-tkg": "proton-tkg",
  "luxtorpeda": "luxtorpeda",
  "roberta": "roberta",
  "boxtron": "boxtron",
  "steam-tinker-launch": "steam-tinker-launch",
  "umu-proton": "umu-proton",
  "proton-sarek": "proton-sarek",
  "proton-plop": "proton-plop",
  "proton-lina": "proton-lina",
  "proton-lfx2": "proton-lfx2",
  "proton-speedhack": "proton-speedhack",
  "valve": "valve",
  "proton-experimental": "valve",
  "proton-hotfix": "valve",
};

interface ProtonDbData {
  gameId: string;
  steamAppId: string;
  totalReports: number;
  versions: Array<{
    version: string;
    total: number;
    positive: number;
    negative: number;
    positiveRatio: number;
  }>;
  recommended: string[];
}

interface ProtonRecommendationModalProps {
  visible: boolean;
  gameId: string;
  gameTitle: string;
  installedProtons: ProtonVersion[];
  mode?: "install" | "switch";
  currentProtonPath?: string;
  onClose: () => void;
  onSelect: (protonPath: string) => void;
  onSwitchProton?: (protonPath: string) => Promise<{ ok: boolean; data?: { savesRestored: number; dllsInstalled: string[] }; error?: string } | void>;
  onDownloadAndSelect?: (fork: ProtonFork) => Promise<void>;
}

interface DownloadProgress {
  status: string;
  percent: number;
  gameTitle?: string;
}

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
  const [expandedForks, setExpandedForks] = useState<Set<string>>(new Set());
  const [selectedFork, setSelectedFork] = useState<ProtonFork | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [selectedProton, setSelectedProton] = useState<string | null>(null);
  const [protonDbData, setProtonDbData] = useState<ProtonDbData | null>(null);
  const [allTools, setAllTools] = useState<any[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchResult, setSwitchResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setAllForks([]);
    setSelectedFork(null);
    setSelectedVersion("");
    setSelectedProton(null);
    setExpandedForks(new Set());
    setProtonDbData(null);
    setDownloadProgress(null);
    setSwitchResult(null);
    setSwitching(false);

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
        setProtonDbData(protonDb as ProtonDbData | null);
        setAllTools(protonTools as any[]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Falha ao obter forks");
        setLoading(false);
      });
  }, [visible, gameId]);

  useEffect(() => {
    if (!visible) return;
    const unsub = window.electron.onInstallProgress((data) => {
      setDownloadProgress(data);
    });
    return unsub;
  }, [visible]);

  const forkInfoMap = useMemo(() => {
    const map: Record<string, any> = {};
    forkCatalog.forEach((f: any) => {
      map[f.id] = {
        versions: f.versions || [],
        name: f.name,
        tierScore: f.tierScore,
        ranking: f.ranking,
      };
    });
    return map;
  }, [forkCatalog]);

  const manualGroups = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        title: string;
        description: string;
        category: string;
        installed: { version: string; path: string }[];
      }
    > = {};

    const toolConfigMap: Record<string, any> = {};
    allTools.forEach((t: any) => {
      toolConfigMap[t.id] = t;
    });

    installedTools.forEach((item: any) => {
      const id = item.tool?.id || "unknown";
      if (!map[id]) {
        const cfg = toolConfigMap[id];
        map[id] = {
          id,
          title: cfg?.title || item.tool?.title || id,
          description: cfg?.description || "",
          category: cfg?.category || "proton",
          installed: [],
        };
      }
      map[id].installed.push({
        version: item.version,
        path: item.path,
      });
    });

    return Object.entries(map)
      .filter(([_, g]) => g.installed.length > 0)
      .sort((a, b) => {
        if (a[1].category !== b[1].category)
          return a[1].category === "proton" ? -1 : 1;
        return a[1].title.localeCompare(b[1].title);
      })
      .map(([_, g]) => g);
  }, [installedTools, allTools]);

  const getTierColor = (tier: string) =>
    TIER_COLORS[tier.toLowerCase()] || "#888";
  const getTierBg = (tier: string) =>
    TIER_BG_COLORS[tier.toLowerCase()] || "transparent";

  const getConfidenceDisplay = (confidence: string) => {
    const entry = CONFIDENCE_LABELS[confidence.toLowerCase()];
    return entry || { label: confidence, color: "#888" };
  };

  const selectedDisplayName = useMemo(() => {
    if (selectedFork) return selectedFork.name;
    if (!selectedProton) return null;
    const tool = installedTools.find((i: any) => i.path === selectedProton);
    return tool?.version || null;
  }, [selectedProton, selectedFork, installedTools]);

  const findInstalled = useCallback(
    (version: string): { path: string; version: string } | null => {
      const v = version.toLowerCase().replace(/^v/, "");
      for (const tool of installedTools) {
        const tVer = (tool.version || "").toLowerCase().replace(/^v/, "");
        if (tVer === v || tVer.includes(v) || v.includes(tVer)) {
          return { path: tool.path, version: tool.version };
        }
      }
      return null;
    },
    [installedTools]
  );

  const handleSelectVersion = useCallback(
    (fork: ProtonFork, version: string, installedPath?: string) => {
      if (installedPath) {
        setSelectedProton(installedPath);
        setSelectedFork(null);
        setSelectedVersion(version);
        return;
      }
      const info = forkInfoMap[FORK_ALIAS[fork.fork] || fork.fork];
      if (info) {
        setSelectedFork({
          fork: fork.fork,
          name: info.name || fork.name,
          version,
          tier: info.ranking || fork.tier,
          tierScore: info.tierScore ?? fork.tierScore,
          confidence: "manual",
        });
        setSelectedProton(null);
        setSelectedVersion(version);
      } else {
        setSelectedFork({ ...fork, version, confidence: "manual" });
        setSelectedProton(null);
        setSelectedVersion(version);
      }
    },
    [forkInfoMap]
  );

  const handleSelectManual = useCallback((path: string, version: string) => {
    setSelectedProton(path);
    setSelectedFork(null);
    setSelectedVersion(version);
  }, []);

  const detectForkId = useCallback((version: string): string => {
    const v = version.toLowerCase();
    if (v.startsWith("ge-proton") || v.startsWith("proton-ge")) return "ge-proton";
    if (v.includes("experimental")) return "proton-experimental";
    if (v.includes("hotfix")) return "proton-hotfix";
    if (v.startsWith("proton-tkg") || v.includes("tkg")) return "proton-tkg";
    if (v.includes("cachyos")) return "proton-cachyos";
    if (v.includes("dw-proton")) return "dw-proton";
    return "valve";
  }, []);

  const handleSelectRecommendedVersion = useCallback((version: string) => {
    const installed = findInstalled(version);
    if (installed) {
      handleSelectManual(installed.path, installed.version);
      return;
    }

    const forkId = detectForkId(version);
    const forkName = forkInfoMap[forkId]?.name || forkId;

    const existing = allForks.find(
      (f) => f.fork === forkId && forkInfoMap[f.fork]?.versions?.some(
        (v: string) => v === version || v.toLowerCase() === version.toLowerCase()
      )
    );

    if (existing) {
      handleSelectVersion(existing, version);
      return;
    }

    const targetFork: ProtonFork = {
      fork: forkId,
      name: forkName,
      version,
      tier: forkInfoMap[forkId]?.ranking || "gold",
      tierScore: forkInfoMap[forkId]?.tierScore || 80,
      confidence: "protondb",
    };

    handleSelectVersion(targetFork, version);
  }, [allForks, forkInfoMap, handleSelectVersion, detectForkId, findInstalled, handleSelectManual]);

  const handleConfirm = useCallback(async () => {
    const protonPath = selectedProton || (() => {
      if (!selectedFork) return null;
      const installed = findInstalled(selectedFork.version);
      return installed?.path || null;
    })();

    if (!protonPath && !selectedFork) return;

    if (mode === "switch" && onSwitchProton) {
      let pathToSwitch = protonPath;

      // Se o fork não está instalado, baixar primeiro
      if (!pathToSwitch && selectedFork && onDownloadAndSelect) {
        setSwitching(true);
        setSwitchResult(null);
        try {
          pathToSwitch = await window.electron.downloadProton(selectedFork);
        } catch {
          setSwitchResult({ ok: false, msg: "Falha ao baixar o Proton selecionado." });
          setSwitching(false);
          return;
        }
        if (!pathToSwitch) {
          setSwitchResult({ ok: false, msg: "Falha ao baixar o Proton selecionado." });
          setSwitching(false);
          return;
        }
      }

      if (!pathToSwitch) {
        setSwitchResult({ ok: false, msg: "Nenhum Proton selecionado para trocar." });
        return;
      }

      setSwitching(true);
      setSwitchResult(null);
      try {
        const result = await onSwitchProton(pathToSwitch);
        if (result && typeof result === "object") {
          if (result.ok) {
            setSwitchResult({ ok: true, msg: `Proton trocado com sucesso! Saves restaurados: ${result.data?.savesRestored ?? 0}` });
          } else {
            setSwitchResult({ ok: false, msg: result.error || "Falha ao trocar Proton" });
          }
        }
      } catch (err) {
        setSwitchResult({ ok: false, msg: `Erro: ${String(err)}` });
      }
      setSwitching(false);
      return;
    }

    if (selectedProton) {
      onSelect(selectedProton);
      return;
    }
    if (selectedFork) {
      const installed = findInstalled(selectedFork.version);
      if (installed) {
        onSelect(installed.path);
        return;
      }
      if (onDownloadAndSelect) {
        setIsDownloading(true);
        setDownloadProgress({ status: "Iniciando...", percent: 0 });
        try {
          await onDownloadAndSelect(selectedFork);
        } catch {
          // error handled by caller
        } finally {
          setIsDownloading(false);
          setDownloadProgress(null);
        }
      }
    }
  }, [selectedProton, selectedFork, mode, onSelect, onSwitchProton, onDownloadAndSelect, findInstalled]);

  const toggleExpand = useCallback((forkId: string) => {
    setExpandedForks((prev) => {
      const next = new Set(prev);
      if (next.has(forkId)) next.delete(forkId);
      else next.add(forkId);
      return next;
    });
  }, []);

  return (
    <Modal
      visible={visible}
      title={mode === "switch" ? `Trocar Proton — ${gameTitle}` : `Selecionar Proton — ${gameTitle}`}
      onClose={onClose}
      large
    >
      <div className="proton-recommendation-modal">
        {loading && (
          <div className="proton-recommendation-modal__loading">
            Carregando...
          </div>
        )}

        {error && (
          <div className="proton-recommendation-modal__error">{error}</div>
        )}

        {!loading && !error && (
          <>
            {mode === "switch" && (
              <div className="prm__switch-warning">
                <p>⚠️ Trocar o Proton recriará o prefixo do jogo. <strong>Saves serão preservados</strong>, mas configurações de mods e registry serão recriadas.</p>
                {currentProtonPath && (
                  <p className="prm__switch-current">Proton atual: <code>{currentProtonPath.split("/").pop()}</code></p>
                )}
              </div>
            )}
            {(selectedProton || selectedFork) && (
              <div className="prm__selected">
                <div className="prm__selected-header">
                  <div className="prm__selected-info">
                    <span className="prm__selected-name">
                      {selectedFork?.name ||
                        (selectedProton
                          ? installedTools.find(
                              (i: any) => i.path === selectedProton
                            )?.tool?.title
                          : "") ||
                        selectedVersion}
                    </span>
                    <span className="prm__selected-version">
                      {selectedVersion}
                    </span>
                    {selectedFork && (
                      <span
                        className="prm__selected-tier"
                        style={{
                          borderColor: getTierColor(selectedFork.tier),
                          backgroundColor: getTierBg(selectedFork.tier),
                          color: getTierColor(selectedFork.tier),
                        }}
                      >
                        {selectedFork.tier}
                      </span>
                    )}
                  </div>
                  {selectedFork && (
                    <div className="prm__selected-score">
                      <span>Score</span>
                      <span
                        className="prm__selected-score-value"
                        style={{ color: getTierColor(selectedFork.tier) }}
                      >
                        {selectedFork.tierScore}
                      </span>
                    </div>
                  )}
                </div>
                {isDownloading && downloadProgress && (
                  <div className="prm__selected-progress">
                    <div className="prm__progress-bar">
                      <div
                        className="prm__progress-fill"
                        style={{ width: `${Math.max(2, downloadProgress.percent)}%` }}
                      />
                    </div>
                    <span className="prm__progress-text">
                      {downloadProgress.status || "Baixando..."} ({downloadProgress.percent}%)
                    </span>
                  </div>
                )}
                <div className="prm__selected-actions">
                  <Button
                    theme="primary"
                    onClick={handleConfirm}
                    disabled={isDownloading || switching}
                  >
                    {switching
                      ? "Trocando Proton..."
                      : isDownloading
                        ? "Baixando..."
                        : mode === "switch"
                          ? `Trocar para ${selectedDisplayName || selectedVersion}`
                          : selectedProton
                            ? `Instalar com ${selectedDisplayName || selectedVersion}`
                            : `Baixar e Instalar ${selectedDisplayName || selectedVersion}`}
                  </Button>
                  <Button onClick={() => { setSelectedFork(null); setSelectedProton(null); setSelectedVersion(""); setDownloadProgress(null); setSwitchResult(null); }}>
                    Limpar
                  </Button>
                </div>
                {switchResult && (
                  <div className={`prm__switch-result ${switchResult.ok ? "--ok" : "--fail"}`}>
                    {switchResult.ok ? "✅ " : "❌ "}{switchResult.msg}
                  </div>
                )}
              </div>
            )}

            {protonDbData && protonDbData.recommended.length > 0 && (
              <div className="prm__db-recommended">
                <h4>🔍 ProtonDB — Recomendado para este jogo</h4>
                <p className="prm__db-subtitle">
                  {protonDbData.totalReports} reports analisados — baseado em dados da comunidade
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
                        className={`prm__db-version prm__db-version--clickable ${installed ? "prm__db-version--installed" : ""}`}
                        onClick={() => handleSelectRecommendedVersion(ver)}
                      >
                        <div className="prm__db-version-left">
                          <span className="prm__db-version-name">{ver}</span>
                          {versionInfo && (
                            <span className="prm__db-version-stats">
                              {Math.round(versionInfo.positiveRatio * 100)}% positivo · {versionInfo.total} {versionInfo.total === 1 ? "report" : "reports"}
                            </span>
                          )}
                        </div>
                        <span className={`prm__db-version-action ${installed ? "prm__db-version-action--installed" : ""}`}>
                          {installed ? "✓ Instalado" : "Baixar"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="prm__forks">
              <h4>Forks instalados</h4>
              <div className="prm__forks-list">
                {allForks.filter((fork) => {
                  const info = forkInfoMap[FORK_ALIAS[fork.fork] || fork.fork];
                  const versions = info?.versions || [];
                  return versions.some((ver: string) => findInstalled(ver));
                }).map((fork) => {
                  const isExpanded = expandedForks.has(fork.fork);
                  const info = forkInfoMap[FORK_ALIAS[fork.fork] || fork.fork];
                  const versions = info?.versions || [];
                  const isCurrentSelection =
                    selectedFork?.fork === fork.fork;
                  return (
                    <div
                      key={fork.fork}
                      className={`prm__fork-card ${isCurrentSelection ? "prm__fork-card--selected" : ""}`}
                    >
                      <div
                        className="prm__fork-header"
                        onClick={() => toggleExpand(fork.fork)}
                      >
                        <div className="prm__fork-header-left">
                          <div className="prm__fork-icon">
                            <span>{fork.name.charAt(0)}</span>
                          </div>
                          <div>
                            <span className="prm__fork-name">
                              {fork.name}
                            </span>
                            <span className="prm__fork-version">
                              {versions.length > 0
                                ? `${versions.length} versões`
                                : fork.version}
                            </span>
                          </div>
                        </div>
                        <div className="prm__fork-header-right">
                          <span
                            className="prm__fork-tier-badge"
                            style={{
                              borderColor: getTierColor(fork.tier),
                              color: getTierColor(fork.tier),
                            }}
                          >
                            {fork.tier}
                          </span>
                          <span className="prm__fork-score">
                            {fork.tierScore}
                          </span>
                          <span className="prm__fork-expand">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="prm__fork-versions">
                          {versions.map((ver: string) => {
                            const installedTool = installedTools.find(
                              (t: any) => {
                                const tForkId =
                                  PROTON_TO_FORK_ID[t.tool?.id] ||
                                  t.tool?.id;
                                return (
                                  tForkId === fork.fork &&
                                  (t.version === ver ||
                                    t.path?.includes(ver))
                                );
                              }
                            );
                            const isSelected =
                              selectedProton === installedTool?.path ||
                              (selectedFork?.fork === fork.fork &&
                                selectedVersion === ver);
                            return (
                              <div
                                key={`${fork.fork}-${ver}`}
                                className={`prm__version ${isSelected ? "prm__version--selected" : ""}`}
                                onClick={() =>
                                  handleSelectVersion(
                                    fork,
                                    ver,
                                    installedTool?.path
                                  )
                                }
                              >
                                <span className="prm__version-name">
                                  {ver}
                                </span>
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
                                  <span className="prm__version-check">
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
            </div>

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
                      onClick={() =>
                        toggleExpand(`manual-${group.id}`)
                      }
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
                              onClick={() =>
                                handleSelectManual(item.path, item.version)
                              }
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

            {(selectedProton || selectedFork) && (
              <div className="proton-recommendation-modal__actions">
                <Button theme="dark" onClick={onClose}>
                  {mode === "switch" && switchResult?.ok ? "Fechar" : "Cancelar"}
                </Button>
                <Button
                  theme="primary"
                  onClick={handleConfirm}
                  disabled={isDownloading || switching}
                >
                  {switching
                    ? "Trocando Proton..."
                    : isDownloading
                      ? "Baixando..."
                      : mode === "switch"
                        ? `Trocar para ${selectedDisplayName || selectedVersion}`
                        : selectedProton
                          ? `Instalar com ${selectedDisplayName || selectedVersion}`
                          : `Baixar e Instalar ${selectedDisplayName || selectedVersion}`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
