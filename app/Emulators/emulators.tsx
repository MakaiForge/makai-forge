import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@components";
import { useRunners } from "@hooks/use-runners";
import type { RunnerDefinition, RomSite } from "@emulators/types";
import { Play, Square, Plus, ExternalLink } from "lucide-react";
import { logger } from "@shared-logger";
import { CATEGORY_LABELS } from "@shared/constants/categories";
import "./emulators.scss";

const STORAGE_KEY = "emulator-extra-sites";

function loadExtraSites(): Record<string, RomSite[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveExtraSites(data: Record<string, RomSite[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function Emulators() {
  const { t } = useTranslation("emulators");
  const navigate = useNavigate();
  const { installed, icons, loading, refresh } = useRunners();
  const [allRunners, setAllRunners] = useState<RunnerDefinition[]>([]);
  const [selectedRom, setSelectedRom] = useState<string>("");
  const [launching, setLaunching] = useState<string | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [activeSiteTab, setActiveSiteTab] = useState<string | null>(null);
  const [extraSites, setExtraSites] = useState<Record<string, RomSite[]>>(loadExtraSites);

  useEffect(() => {
    window.electron.getRunners().then(setAllRunners);
  }, []);

  const getRomSites = useCallback(
    (runner: RunnerDefinition): RomSite[] => {
      const extra = extraSites[runner.id] || [];
      return [...runner.romSites, ...extra];
    },
    [extraSites]
  );

  const [addSiteRunnerId, setAddSiteRunnerId] = useState<string | null>(null);
  const [addSiteName, setAddSiteName] = useState("");
  const [addSiteUrl, setAddSiteUrl] = useState("");

  const handleAddSite = useCallback(
    (runnerId: string) => {
      setAddSiteRunnerId(runnerId);
      setAddSiteName("");
      setAddSiteUrl("");
    },
    []
  );

  const handleConfirmAddSite = useCallback(() => {
    if (!addSiteRunnerId || !addSiteName.trim() || !addSiteUrl.trim()) return;
    const updated = { ...extraSites };
    if (!updated[addSiteRunnerId]) updated[addSiteRunnerId] = [];
    updated[addSiteRunnerId] = [...updated[addSiteRunnerId], { name: addSiteName.trim(), url: addSiteUrl.trim() }];
    setExtraSites(updated);
    saveExtraSites(updated);
    setAddSiteRunnerId(null);
  }, [addSiteRunnerId, addSiteName, addSiteUrl, extraSites]);

  const handleRemoveSite = useCallback(
    (runnerId: string, index: number) => {
      const updated = { ...extraSites };
      const sites = updated[runnerId] || [];
      sites.splice(index, 1);
      if (sites.length === 0) {
        delete updated[runnerId];
      } else {
        updated[runnerId] = sites;
      }
      setExtraSites(updated);
      saveExtraSites(updated);
    },
    [extraSites]
  );

  const installedIds = new Set(installed.map((r) => r.id));

  const handlePlay = useCallback(
    async (runnerId: string) => {
      if (running.has(runnerId)) {
        await window.electron.closeRunner(runnerId);
        setRunning((prev) => {
          const next = new Set(prev);
          next.delete(runnerId);
          return next;
        });
        return;
      }

      if (!selectedRom) {
        const result = await window.electron.showOpenDialog({
          properties: ["openFile"],
          filters: [
            { name: "ROMs", extensions: ["nes", "snes", "smc", "sfc", "gba", "gbc", "gb", "n64", "z64", "v64", "nds", "iso", "bin", "cue", "chd", "pce", "a78", "lnx", "rom"] },
          ],
        });
        if (result.canceled || !result.filePaths?.[0]) return;
        setSelectedRom(result.filePaths[0]);
      }

      setLaunching(runnerId);
      try {
        await window.electron.launchGame(runnerId, selectedRom);
        setRunning((prev) => new Set(prev).add(runnerId));
      } catch (err) {
        logger.error("Erro ao lançar emulador:", err);
      }
      setLaunching(null);
    },
    [selectedRom, running]
  );

  useEffect(() => {
    const unsub = window.electron.onGamesRunning(() => {
      // Game running events handled separately
    });
    return () => unsub();
  }, []);

  const groupedRunners = allRunners.reduce(
    (acc, r) => {
      const cat = r.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    },
    {} as Record<string, RunnerDefinition[]>
  );

  return (
    <div className="emulators">
      {/* Modal de adicionar site */}
      {addSiteRunnerId && (
        <div className="emulators__modal-overlay" onClick={() => setAddSiteRunnerId(null)}>
          <div className="emulators__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Adicionar site de ROM</h3>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Nome</label>
              <input
                type="text"
                value={addSiteName}
                onChange={(e) => setAddSiteName(e.target.value)}
                placeholder="Nome do site"
                style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6, border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)", color: "var(--text)", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>URL</label>
              <input
                type="url"
                value={addSiteUrl}
                onChange={(e) => setAddSiteUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => e.key === "Enter" && handleConfirmAddSite()}
                style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6, border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)", color: "var(--text)", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={handleConfirmAddSite}
                disabled={!addSiteName.trim() || !addSiteUrl.trim()}
                style={{ flex: 1, padding: "0.5rem", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => setAddSiteRunnerId(null)}
                style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-dim)", fontSize: "0.85rem", cursor: "pointer" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="emulators__header">
        <h1>{t("emulators", "Emuladores")}</h1>
        <p className="emulators__subtitle">
          {t("emulators_subtitle", "Emuladores instalados e disponíveis")}
        </p>
        {installed.length === 0 && !loading && (
          <div className="emulators__empty">
            <p>{t("no_emulators_installed", "Nenhum emulador instalado.")}</p>
            <Button onClick={() => navigate("/settings?tab=runners")} theme="primary">
              {t("go_to_settings", "Ir para Configurações")}
            </Button>
          </div>
        )}
      </div>

      {Object.entries(groupedRunners).map(([category, runners]) => {
        const hasInstalled = runners.some((r) => installedIds.has(r.id));
        if (!hasInstalled) return null;

        return (
          <section key={category} className="emulators__section">
            <h2 className="emulators__category-title">
              {CATEGORY_LABELS[category] || category}
            </h2>
            <div className="emulators__grid">
              {runners.map((runner) => {
                if (!installedIds.has(runner.id)) return null;
                const iconDataUrl = icons[runner.id];
                const entry = installed.find((i) => i.id === runner.id);
                const isLaunching = launching === runner.id;
                const isRunning = running.has(runner.id);
                const isExpanded = expandedCard === runner.id;

                return (
                  <div
                    key={runner.id}
                    className={`emulators__card ${isExpanded ? "emulators__card--expanded" : ""}`}
                  >
                    <div className="emulators__card-top">
                      <div className="emulators__card-header">
                        {iconDataUrl ? (
                          <img
                            src={iconDataUrl}
                            alt={runner.humanName}
                            className="emulators__icon"
                          />
                        ) : (
                          <div className="emulators__icon-placeholder">
                            {runner.humanName.charAt(0)}
                          </div>
                        )}
                        <div className="emulators__card-info">
                          <strong className="emulators__card-name">
                            {runner.humanName}
                          </strong>
                          <span className="emulators__card-platforms">
                            {runner.platforms.join(", ")}
                          </span>
                        </div>
                      </div>
                      <div className="emulators__card-actions-top">
                        <div className="emulators__card-version">
                          v{entry?.installedVersion || "?"}
                        </div>
                        <button
                          type="button"
                          className={`emulators__play-btn ${isRunning ? "emulators__play-btn--running" : ""}`}
                          onClick={() => handlePlay(runner.id)}
                          disabled={isLaunching}
                          title={isRunning ? "Parar" : "Executar"}
                        >
                          {isLaunching ? (
                            <span className="emulators__play-btn-spinner" />
                          ) : isRunning ? (
                            <Square size={14} fill="currentColor" />
                          ) : (
                            <Play size={14} fill="currentColor" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="emulators__card-desc">{runner.description}</p>

                    <div
                      className="emulators__rom-sites-toggle"
                      onClick={() => setExpandedCard(isExpanded ? null : runner.id)}
                    >
                      <span>{t("rom_sites", "Sites de ROMs")}</span>
                      <span className={`emulators__rom-sites-arrow ${isExpanded ? "emulators__rom-sites-arrow--open" : ""}`}>
                        ▸
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="emulators__rom-sites-content">
                        <div className="emulators__rom-sites-tabs">
                          {getRomSites(runner).map((site, idx) => (
                            <button
                              key={`${site.url}-${idx}`}
                              type="button"
                              className={`emulators__rom-site-tab ${activeSiteTab === site.url ? "emulators__rom-site-tab--active" : ""}`}
                              onClick={() => setActiveSiteTab(activeSiteTab === site.url ? null : site.url)}
                            >
                              <span>{site.name}</span>
                              <ExternalLink
                                size={12}
                                className="emulators__rom-site-open"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.electron.openExternal(site.url);
                                }}
                              />
                            </button>
                          ))}
                          <button
                            type="button"
                            className="emulators__rom-site-add-btn"
                            onClick={() => handleAddSite(runner.id)}
                            title="Adicionar site"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {activeSiteTab && getRomSites(runner).some((s) => s.url === activeSiteTab) && (
                          <div className="emulators__rom-site-preview">
                            <webview
                              src={activeSiteTab}
                              style={{ width: "100%", height: "100%" }}
                              partition="emulator-webview"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
