import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import { ProgressBar, Button } from "@renderer/components";
import type { RunnerDefinition, RunnerStatus } from "@emulators/types";
import "./settings-runners.scss";

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

const STORAGE_KEY = "runner-preferences";

interface RunnerPrefs {
  showInSidebar: boolean;
  autoUpdate: boolean;
  launchEmulatorGui?: boolean;
}

function loadPrefs(): Record<string, RunnerPrefs> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePrefs(prefs: Record<string, RunnerPrefs>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("runnerPrefsChanged"));
}

export function SettingsContextRunners() {
  const { t } = useTranslation("settings");

  const [runners, setRunners] = useState<RunnerDefinition[]>([]);
  const [statuses, setStatuses] = useState<Record<string, RunnerStatus | null>>({});
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState("");
  const [prefs, setPrefs] = useState<Record<string, RunnerPrefs>>(loadPrefs);
  const [popupMsg, setPopupMsg] = useState<{ id: string; msg: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [runnersData, statusesData] = await Promise.all([
      window.electron.getRunners(),
      window.electron.getAllRunnersStatus(),
    ]);
    setRunners(runnersData);
    setStatuses(statusesData);

    const iconMap: Record<string, string | null> = {};
    for (const r of runnersData) {
      iconMap[r.id] = await window.electron.getRunnerIcon(r.id);
    }
    setIcons(iconMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const togglePref = useCallback((id: string, key: keyof RunnerPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev };
      if (!next[id]) next[id] = { showInSidebar: true, autoUpdate: true };
      next[id] = { ...next[id], [key]: !next[id][key] };
      savePrefs(next);
      return next;
    });
  }, []);

  const showPopup = useCallback((id: string, msg: string) => {
    setPopupMsg({ id, msg });
    setTimeout(() => setPopupMsg(null), 2000);
  }, []);

  const handleInstall = async (runnerId: string) => {
    setInstalling(runnerId);
    setInstallProgress(0);
    setInstallStatus("Preparando...");
    const interval = setInterval(async () => {
      const updated = await window.electron.getAllRunnersStatus();
      setStatuses(updated);
    }, 2000);
    try {
      const result = await window.electron.installRunner(runnerId);
      setStatuses((prev) => ({ ...prev, [runnerId]: result }));
      showPopup(runnerId, "Instalado com sucesso!");
    } catch {
      setInstallStatus("Falha na instalação");
      showPopup(runnerId, "Falha na instalação");
    }
    clearInterval(interval);
    setInstalling(null);
  };

  const handleUninstall = async (runnerId: string) => {
    await window.electron.uninstallRunner(runnerId);
    setStatuses((prev) => ({ ...prev, [runnerId]: null }));
    showPopup(runnerId, "Desinstalado");
  };

  const handleCheckUpdate = async (runnerId: string) => {
    showPopup(runnerId, "Verificando...");
    try {
      const updates = await window.electron.checkRunnerUpdates(runnerId);
      if (updates.length > 0) {
        showPopup(runnerId, "Atualização encontrada! Baixando...");
        await window.electron.installRunner(runnerId);
        const updated = await window.electron.getAllRunnersStatus();
        setStatuses(updated);
        showPopup(runnerId, "Atualizado!");
      } else {
        showPopup(runnerId, "Sem atualizações");
      }
    } catch {
      showPopup(runnerId, "Erro ao verificar");
    }
  };

  const handleLaunch = async (runnerId: string) => {
    try {
      const pref = getPref(runnerId);
      if (pref.launchEmulatorGui) {
        await window.electron.launchGame(runnerId, "");
      } else {
        const result = await window.electron.showOpenDialog({
          properties: ["openFile"],
          filters: [
            { name: "ROMs", extensions: ["nes", "snes", "smc", "sfc", "gba", "gbc", "gb", "n64", "z64", "v64", "nds", "iso", "bin", "cue", "chd", "pce", "a78", "lnx", "rom"] },
          ],
        });
        if (result.canceled || !result.filePaths?.[0]) return;
        await window.electron.launchGame(runnerId, result.filePaths[0]);
      }
    } catch (err) {
      console.error("Erro ao lançar:", err);
    }
  };

  const getPref = (id: string): RunnerPrefs => {
    return prefs[id] || { showInSidebar: true, autoUpdate: true, launchEmulatorGui: true };
  };

  const groupedRunners = runners.reduce(
    (acc, r) => {
      const cat = r.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    },
    {} as Record<string, RunnerDefinition[]>
  );

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("runners_title", "Gerenciador de Executores (Emuladores)")}</h3>
        <p className="settings-context-panel__description">
          {t("runners_description", "Instale, execute e gerencie emuladores para seus ROMs.")}
        </p>
      </div>

      {loading && <p className="runners__loading">{t("loading", "Carregando...")}</p>}

      {Object.entries(groupedRunners).map(([category, categoryRunners]) => (
        <div key={category} className="settings-context-panel__group">
          <h4 className="runners__category-title">
            {CATEGORY_LABELS[category] || category}
          </h4>
          <div className="runners__grid">
            {categoryRunners.map((runner) => {
              const status = statuses[runner.id];
              const isInstalled = status?.isInstalled ?? false;
              const isBusy = installing === runner.id;
              const p = getPref(runner.id);

              return (
                <div key={runner.id} className="runners__card">
                  <div className="runners__card-header">
                    {icons[runner.id] ? (
                      <img
                        src={icons[runner.id]!}
                        alt={runner.humanName}
                        className="runners__icon"
                      />
                    ) : (
                      <div className="runners__icon-placeholder">
                        {runner.humanName.charAt(0)}
                      </div>
                    )}
                    <div className="runners__card-info">
                      <strong className="runners__card-name">
                        {runner.humanName}
                      </strong>
                      <span className="runners__card-platforms">
                        {runner.platforms.join(", ")}
                      </span>
                    </div>
                  </div>

                  <p className="runners__card-desc">{runner.description}</p>

                  {runner.notes && (
                    <p className="runners__card-notes">{runner.notes}</p>
                  )}

                  <div className="runners__card-footer">
                      {runner.isPaid ? (
                        <span className="runners__version-badge runners__badge--paid">
                          {t("paid", "Pago")}
                        </span>
                      ) : runner.isAbandoned ? (
                        <span className="runners__version-badge runners__badge--abandoned">
                          {t("abandoned", "Abandonado")}
                        </span>
                      ) : isInstalled ? (
                        <span className="runners__version-badge">
                          v{status?.installedVersion || "?"}
                        </span>
                      ) : (
                        <span className="runners__not-installed">
                          {t("not_installed", "Não instalado")}
                        </span>
                      )}

                      <div className="runners__card-actions">
                        {isInstalled ? (
                          <>
                            <Button
                              onClick={() => handleLaunch(runner.id)}
                              theme="primary"
                              disabled={isBusy}
                            >
                              {t("execute", "Executar")}
                            </Button>
                            <Button
                              onClick={() => handleUninstall(runner.id)}
                              theme="danger"
                              disabled={isBusy}
                            >
                              {t("remove", "Desinstalar")}
                            </Button>
                          </>
                        ) : runner.isPaid ? (
                          <Button
                            onClick={() => window.electron.openExternal(runner.paidUrl || "")}
                            theme="primary"
                          >
                            {t("buy", "Adquirir")}
                          </Button>
                        ) : runner.isAbandoned ? (
                          <span className="runners__unavailable">
                            {t("unavailable", "Indisponível")}
                          </span>
                        ) : (
                          <Button
                            onClick={() => handleInstall(runner.id)}
                            theme="primary"
                            disabled={isBusy}
                          >
                            {t("install", "Instalar")}
                          </Button>
                        )}
                      </div>
                  </div>

                  {isInstalled && (
                    <div className="runners__toggles">
                      <label className="runners__toggle">
                        <input
                          type="checkbox"
                          checked={p.showInSidebar}
                          onChange={() => togglePref(runner.id, "showInSidebar")}
                        />
                        <span>{t("show_in_sidebar", "Aparece na Sidebar")}</span>
                      </label>
                      <label className="runners__toggle">
                        <input
                          type="checkbox"
                          checked={p.autoUpdate}
                          onChange={() => togglePref(runner.id, "autoUpdate")}
                        />
                        <span>{t("auto_update", "Auto-atualizar")}</span>
                      </label>
                      {(!runner.runnerType || runner.runnerType === "standalone") && (
                        <label className="runners__toggle">
                          <input
                            type="checkbox"
                            checked={p.launchEmulatorGui || false}
                            onChange={() => togglePref(runner.id, "launchEmulatorGui")}
                          />
                          <span>{t("launch_gui", "Abrir interface do emulador")}</span>
                        </label>
                      )}
                      <Button
                        onClick={() => handleCheckUpdate(runner.id)}
                        theme="outline"
                        disabled={isBusy}
                      >
                        {t("check_updates", "Verificar Atualizações")}
                      </Button>
                    </div>
                  )}

                  {popupMsg && popupMsg.id === runner.id && (
                    <div className="runners__popup">{popupMsg.msg}</div>
                  )}

                  {isBusy && (
                    <div className="runners__progress">
                      <ProgressBar value={installProgress} />
                      <span className="runners__progress-text">
                        {installStatus}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
