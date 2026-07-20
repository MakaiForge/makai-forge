import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@renderer/components";
import { useRunners } from "@renderer/hooks/use-runners";
import type { RunnerDefinition, RomSite } from "@emulators/types";
import { Play, Square, Plus, ExternalLink } from "lucide-react";
import "./emulators.scss";

const CATEGORY_LABELS: Record<string, string> = {
  nintendo: "Nintendo",
  sony: "Sony",
  sega: "Sega",
  arcade: "Arcade",
  computers: "Computadores",
  microsoft: "Microsoft",
  multi: "Multiplataforma",
  obscure: "Obscuro",
};

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

  const handleAddSite = useCallback(
    (runnerId: string) => {
      const name = prompt("Nome do site:");
      if (!name) return;
      const url = prompt("URL do site:");
      if (!url) return;
      const updated = { ...extraSites };
      if (!updated[runnerId]) updated[runnerId] = [];
      updated[runnerId] = [...updated[runnerId], { name, url }];
      setExtraSites(updated);
      saveExtraSites(updated);
    },
    [extraSites]
  );

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
        console.error("Erro ao lançar:", err);
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
                              webpreferences="disablewebsecurity"
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
