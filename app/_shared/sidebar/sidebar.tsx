import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { CpuIcon, PlusIcon, SidebarCollapseIcon } from "@primer/octicons-react";
import { Play, Square } from "lucide-react";

import { ConfirmationModal } from "@components";
import {
  useDownload,
  useLibrary,
  useToast,
  useUserDetails,
  useRunnersRunning,
  useSupplemental,
} from "@hooks";

import { routes } from "./routes";

import "./sidebar.scss";

import { CommentDiscussionIcon } from "@primer/octicons-react";
import deckyIcon from "@renderer/assets/icons/decky.png";
import { setFriendRequestCount } from "@features/user-details-slice";
import cn from "classnames";
import { useDispatch } from "react-redux";
import { SidebarAddingCustomGameModal } from "./sidebar-adding-custom-game-modal";
import { useSidebarTheme } from "./useSidebarTheme";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_INITIAL_WIDTH = 250;
const SIDEBAR_MAX_WIDTH = 450;
const SIDEBAR_COLLAPSED_WIDTH = 60;
const STORAGE_PREFS_KEY = "runner-preferences";

const initialSidebarWidth = window.localStorage.getItem("sidebarWidth");

interface SidebarRunner {
  id: string;
  humanName: string;
  icon: string | null;
}

function loadRunnerPrefs(): Record<string, { showInSidebar: boolean; launchEmulatorGui?: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function Sidebar() {
  useSidebarTheme();

  const dispatch = useDispatch();

  const { t } = useTranslation(["sidebar", "library"]);
  const { updateLibrary } = useLibrary();
  const [deckyPluginInfo, setDeckyPluginInfo] = useState<{
    installed: boolean;
    version: string | null;
    outdated: boolean;
  }>({ installed: false, version: null, outdated: false });
  const [homebrewFolderExists, setHomebrewFolderExists] = useState(false);
  const [showDeckyConfirmModal, setShowDeckyConfirmModal] = useState(false);
  const navigate = useNavigate();

  const [isResizing, setIsResizing] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return window.localStorage.getItem("sidebarCollapsed") === "true";
  });
  const [sidebarWidth, setSidebarWidth] = useState(
    initialSidebarWidth ? Number(initialSidebarWidth) : SIDEBAR_INITIAL_WIDTH
  );

  const location = useLocation();

  const { hasActiveSubscription } = useUserDetails();

  const { lastPacket } = useDownload();

  const { showSuccessToast, showErrorToast } = useToast();

  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [runnerUpdatesCount, setRunnerUpdatesCount] = useState(0);
  const [sidebarRunners, setSidebarRunners] = useState<SidebarRunner[]>([]);
  const runningRunners = useRunnersRunning();
  const { showTabs } = useSupplemental();

  const visibleRoutes = routes.filter((r): r is (typeof routes)[number] & { path: string } =>
    r !== false && (!r.requiresHackerman || showTabs)
  );

  const handleCloseAddGameModal = () => {
    setShowAddGameModal(false);
  };

  const loadDeckyPluginInfo = async () => {
    if (window.electron.platform !== "linux") return;

    try {
      const [info, folderExists] = await Promise.all([
        window.electron.getForgerDeckyPluginInfo(),
        window.electron.checkHomebrewFolderExists(),
      ]);

      setDeckyPluginInfo({
        installed: info.installed,
        version: info.version,
        outdated: info.outdated,
      });
      setHomebrewFolderExists(folderExists);
    } catch (error) {
      console.error("Failed to load Decky plugin info:", error);
    }
  };

  const loadSidebarRunners = useCallback(async () => {
    try {
      const [runners, statuses, icons] = await Promise.all([
        window.electron.getRunners(),
        window.electron.getAllRunnersStatus(),
        Promise.all(
          (await window.electron.getRunners()).map((r: any) =>
            window.electron.getRunnerIcon(r.id).then((icon: any) => ({ id: r.id, icon }))
          )
        ),
      ]);
      const prefs = loadRunnerPrefs();
      const iconMap = Object.fromEntries(icons.map((i: any) => [i.id, i.icon]));
      const installed = runners
        .filter((r: any) => statuses[r.id]?.isInstalled)
        .filter((r: any) => prefs[r.id]?.showInSidebar !== false)
        .map((r: any) => ({
          id: r.id,
          humanName: r.humanName,
          icon: iconMap[r.id],
        }));
      setSidebarRunners(installed);
    } catch {}
  }, []);

  const handleInstallForgerDeckyPlugin = () => {
    if (deckyPluginInfo.installed && !deckyPluginInfo.outdated) {
      return;
    }
    setShowDeckyConfirmModal(true);
  };

  const handleConfirmDeckyInstallation = async () => {
    setShowDeckyConfirmModal(false);

    try {
      const result = await window.electron.installForgerDeckyPlugin();

      if (result.success) {
        showSuccessToast(
          t("decky_plugin_installed", {
            version: result.currentVersion,
          })
        );
        await loadDeckyPluginInfo();
      } else {
        showErrorToast(
          t("decky_plugin_installation_failed", {
            error: result.error || "Unknown error",
          })
        );
      }
    } catch (error) {
      showErrorToast(
        t("decky_plugin_installation_error", { error: String(error) })
      );
    }
  };

  useEffect(() => {
    updateLibrary();
  }, [lastPacket?.gameId, updateLibrary]);

  useEffect(() => {
    loadDeckyPluginInfo();
  }, []);

  useEffect(() => {
    loadSidebarRunners();
  }, [loadSidebarRunners]);

  useEffect(() => {
    const onPrefsChanged = () => loadSidebarRunners();
    window.addEventListener("runnerPrefsChanged", onPrefsChanged);
    return () => window.removeEventListener("runnerPrefsChanged", onPrefsChanged);
  }, [loadSidebarRunners]);

  useEffect(() => {
    const unsub = window.electron.onRunnerUpdatesAvailable((updates) => {
      setRunnerUpdatesCount(updates.length);
    });

    window.electron.getRunnersWithUpdates().then((updates) => {
      setRunnerUpdatesCount(updates.length);
    });

    return () => unsub();
  }, []);

  const sidebarRef = useRef<HTMLElement>(null);

  const cursorPos = useRef({ x: 0 });
  const sidebarInitialWidth = useRef(0);

  const handleMouseDown: React.MouseEventHandler<HTMLButtonElement> = (
    event
  ) => {
    if (collapsed) return;
    setIsResizing(true);
    cursorPos.current.x = event.screenX;
    sidebarInitialWidth.current =
      sidebarRef.current?.clientWidth || SIDEBAR_INITIAL_WIDTH;
  };

  useEffect(() => {
    window.onmousemove = (event: MouseEvent) => {
      if (isResizing) {
        const cursorXDelta = event.screenX - cursorPos.current.x;
        const newWidth = Math.max(
          SIDEBAR_MIN_WIDTH,
          Math.min(
            sidebarInitialWidth.current + cursorXDelta,
            SIDEBAR_MAX_WIDTH
          )
        );

        setSidebarWidth(newWidth);
        window.localStorage.setItem("sidebarWidth", String(newWidth));
      }
    };

    window.onmouseup = () => {
      if (isResizing) setIsResizing(false);
    };

    return () => {
      window.onmouseup = null;
      window.onmousemove = null;
    };
  }, [isResizing, collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  const handleSidebarItemClick = (path: string) => {
    if (path !== location.pathname) {
      navigate(path);
    }
  };

  const handleRunnerClick = (runnerId: string) => {
    navigate(`/emulator/${runnerId}`);
  };

  const handleRunnerPlay = async (runnerId: string) => {
    if (runningRunners.has(runnerId)) {
      await window.electron.closeRunner(runnerId);
      return;
    }
    const prefs = loadRunnerPrefs();
    const pref = prefs[runnerId];
    if (pref?.launchEmulatorGui) {
      await window.electron.launchGame(runnerId, "");
      return;
    }
    const result = await window.electron.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "ROMs", extensions: ["nes", "snes", "smc", "sfc", "gba", "gbc", "gb", "n64", "z64", "v64", "nds", "iso", "bin", "cue", "chd", "pce", "a78", "lnx", "rom"] },
      ],
    });
    if (result.canceled || !result.filePaths?.[0]) return;
    try {
      await window.electron.launchGame(runnerId, result.filePaths[0]);
    } catch (err) {
      console.error("Erro ao lançar:", err);
    }
  };

  const effectiveWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  return (
    <aside
      ref={sidebarRef}
      className={cn("sidebar", {
        "sidebar--resizing": isResizing,
        "sidebar--collapsed": collapsed,
      })}
      style={{
        width: collapsed ? effectiveWidth : `var(--sidebar-width, ${effectiveWidth}px)`,
        minWidth: collapsed ? effectiveWidth : `var(--sidebar-width, ${effectiveWidth}px)`,
        maxWidth: collapsed ? effectiveWidth : `var(--sidebar-width, ${effectiveWidth}px)`,
      }}
    >
      <div className="sidebar__container">
        <div className="sidebar__header">
          <button
            type="button"
            className="sidebar__collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            <SidebarCollapseIcon />
          </button>
        </div>

        <div className="sidebar__content">
          <section className="sidebar__section">
            <ul className="sidebar__menu">
              {visibleRoutes.map(({ nameKey, path, render }) => {
                const animClass = (() => {
                  const anim = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-active-animation').trim() ||
                               getComputedStyle(document.documentElement).getPropertyValue('--el-sidebar-active-animation').trim();
                  return anim && anim !== 'none' ? `anim--${anim}` : '';
                })();
                const styleClass = (() => {
                  const style = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-active-style').trim();
                  return style && style !== '' ? `style--${style}` : 'style--gradient';
                })();
                return (
                <li
                  key={nameKey}
                  className={cn("sidebar__menu-item", {
                    "sidebar__menu-item--active": location.pathname === path,
                    [animClass]: location.pathname === path && !!animClass,
                  })}
                >
                  <button
                    type="button"
                    className={cn("sidebar__menu-item-button", {
                      [styleClass]: location.pathname === path,
                    })}
                    onClick={() => handleSidebarItemClick(path)}
                  >
                    {render()}
                    {!collapsed && <span>{t(nameKey)}</span>}
                  </button>
                </li>
              );
              })}

              {window.electron.platform === "linux" && homebrewFolderExists && (
                <li className="sidebar__menu-item sidebar__menu-item--decky">
                  <button
                    type="button"
                    className="sidebar__menu-item-button"
                    onClick={handleInstallForgerDeckyPlugin}
                  >
                    <img
                      src={deckyIcon}
                      alt=""
                      style={{ width: 16, height: 16 }}
                    />
                    {!collapsed && (
                      <span>
                        {deckyPluginInfo.installed && !deckyPluginInfo.outdated
                          ? t("decky_plugin_installed_version", {
                              version: deckyPluginInfo.version,
                            })
                          : deckyPluginInfo.installed && deckyPluginInfo.outdated
                            ? t("update_decky_plugin")
                            : t("install_decky_plugin")}
                      </span>
                    )}
                  </button>
                </li>
              )}
            </ul>
          </section>

          {sidebarRunners.length > 0 && (
            <section className="sidebar__section">
              {!collapsed && (
                <h3 className="sidebar__section-title">Emuladores</h3>
              )}
              <ul className="sidebar__menu">
                {sidebarRunners.map((r) => {
                  const isRunning = runningRunners.has(r.id);
                  return (
                    <li key={r.id} className="sidebar__menu-item sidebar__menu-item--runner">
                      <button
                        type="button"
                        className="sidebar__menu-item-button"
                        onClick={() => handleRunnerClick(r.id)}
                        title={r.humanName}
                      >
                        {r.icon ? (
                          <img
                            src={r.icon}
                            alt={r.humanName}
                            className="sidebar__runner-icon"
                          />
                        ) : (
                          <CpuIcon />
                        )}
                        {!collapsed && <span>{r.humanName}</span>}
                      </button>
                      {!collapsed && (
                        <button
                          type="button"
                          className={`sidebar__runner-play-btn ${isRunning ? "sidebar__runner-play-btn--running" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunnerPlay(r.id);
                          }}
                          title={isRunning ? "Parar" : "Executar"}
                        >
                          {isRunning ? (
                            <Square size={12} fill="currentColor" />
                          ) : (
                            <Play size={12} fill="currentColor" />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
                <li className="sidebar__menu-item">
                  <button
                    type="button"
                    className="sidebar__menu-item-button"
                    onClick={() => navigate("/settings?tab=runners")}
                  >
                    <PlusIcon />
                    {!collapsed && <span>Adicionar Emulador</span>}
                  </button>
                </li>
              </ul>
            </section>
          )}

          {sidebarRunners.length === 0 && !collapsed && (
            <section className="sidebar__section">
              <ul className="sidebar__menu">
                <li className="sidebar__menu-item">
                  <button
                    type="button"
                    className="sidebar__menu-item-button"
                    onClick={() => navigate("/settings?tab=runners")}
                  >
                    <PlusIcon />
                    <span>Adicionar Emulador</span>
                  </button>
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="sidebar__bottom-buttons">
        {hasActiveSubscription && (
          <button
            type="button"
            className="sidebar__help-button"
            data-open-support-chat
          >
            <div className="sidebar__help-button-icon">
              <CommentDiscussionIcon size={14} />
            </div>
            {!collapsed && <span>{t("need_help")}</span>}
          </button>
        )}
      </div>

      <button
        type="button"
        className="sidebar__handle"
        onMouseDown={handleMouseDown}
      />

      <SidebarAddingCustomGameModal
        visible={showAddGameModal}
        onClose={handleCloseAddGameModal}
      />

      <ConfirmationModal
        visible={showDeckyConfirmModal}
        title={
          deckyPluginInfo.installed && deckyPluginInfo.outdated
            ? t("update_decky_plugin_title")
            : t("install_decky_plugin_title")
        }
        descriptionText={
          deckyPluginInfo.installed && deckyPluginInfo.outdated
            ? t("update_decky_plugin_message")
            : t("install_decky_plugin_message")
        }
        onClose={() => setShowDeckyConfirmModal(false)}
        onConfirm={handleConfirmDeckyInstallation}
        cancelButtonLabel={t("cancel")}
        confirmButtonLabel={t("confirm")}
      />
    </aside>
  );
}
