import { useEffect, useRef, useState, useCallback } from "react";
import type { TabInfo, ExtInfo } from "../types";
import { getRelativeCoordinates } from "../utils";

export function useBrowserMirror(mirrorId: string, defaultUrl: string) {
  const urlBarRef = useRef<HTMLInputElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabContextMenuRef = useRef<HTMLDivElement>(null);
  const chromeDropdownRef = useRef<HTMLDivElement>(null);
  const lastInputTimeRef = useRef(0);

  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(defaultUrl);
  const [inputUrl, setInputUrl] = useState(defaultUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoFwd, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [setupStatus, setSetupStatus] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState(0);
  const [loadingTabs, setLoadingTabs] = useState<Set<string>>(new Set());

  const [zoom, setZoom] = useState(1);
  const [muted, setMuted] = useState(false);
  const [bookmarks, setBookmarks] = useState<Array<{ url: string; title: string }>>([]);
  const [extensions, setExtensions] = useState<ExtInfo[]>([]);
  const [extPopupOpen, setExtPopupOpen] = useState(false);
  const [extEnabled, setExtEnabled] = useState(true);
  const [extMsg, setExtMsg] = useState("UltraSurf is protecting your connection.");
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCount, setFindCount] = useState("0");
  const [chromeMenuOpen, setChromeMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: Array<{ label: string; action: () => void } | { divider: true }> } | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sc = window.electron.onChromeSetupProgress((p) => {
      if (cancelled) return;
      setSetupStatus(p.detail ? `${p.status} - ${p.detail}` : p.status);
      setSetupProgress(p.progress);
    });
    (async () => {
      try {
        const r = await window.electron.chromeSetupAndLaunch(mirrorId);
        if (cancelled) return;
        if (!r.success) { setLaunchError(r.error || "Falha ao iniciar Chrome"); return; }
        setSetupStatus(null); setLoading(false);
        const [bms, exts] = await Promise.all([window.electron.chromeGetBookmarks(), window.electron.chromeGetExtensions()]);
        if (!cancelled) { setBookmarks(bms); setExtensions(exts); }
      } catch (err: any) { if (!cancelled) { setLaunchError(err.message); setLoading(false); setSetupStatus(null); } }
    })();
    return () => { cancelled = true; sc(); window.electron.chromeClose(); };
  }, []);

  useEffect(() => {
    const cl = window.electron.onChromeTabList((newTabs) => {
      setTabs(newTabs);
      const active = newTabs.find(t => t.active);
      if (active) { setActiveTabId(active.id); setCurrentUrl(active.url); setInputUrl(active.url); setLoadingTabs(new Set()); }
    });
    return () => cl();
  }, []);

  useEffect(() => {
    const cl = window.electron.onChromeNavigation(({ tabId, url }) => {
      setCurrentUrl(url); setInputUrl(url);
      if (tabId === activeTabId || !activeTabId) updateNavButtons(tabId);
    });
    return () => cl();
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) return;
    window.electron.chromeGetZoom(activeTabId).then(r => setZoom(r.factor)).catch(() => {});
    window.electron.chromeIsPageMuted(activeTabId).then(r => setMuted(r.muted)).catch(() => {});
  }, [activeTabId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (chromeMenuOpen && chromeDropdownRef.current && !chromeDropdownRef.current.contains(e.target as Node)) setChromeMenuOpen(false);
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) hideContextMenu();
      if (tabContextMenu && tabContextMenuRef.current && !tabContextMenuRef.current.contains(e.target as Node)) hideTabContextMenu();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [chromeMenuOpen, contextMenu, tabContextMenu]);

  async function updateNavButtons(tabId?: string) {
    const tid = tabId || activeTabId;
    if (!tid) return;
    try { const h = await window.electron.chromeGetNavHistory(tid); setCanGoBack(h.canGoBack); setCanGoForward(h.canGoForward); }
    catch { setCanGoBack(false); setCanGoForward(false); }
  }

  const handleNavigate = useCallback(async (url?: string) => {
    if (!activeTabId) return;
    const target = url || urlBarRef.current?.value || defaultUrl;
    setLoading(true);
    setLoadingTabs(p => new Set(p).add(activeTabId));
    const r = await window.electron.chromeNavigate(activeTabId, target);
    if (r.success && r.url) { setCurrentUrl(r.url); setInputUrl(r.url); }
    setLoadingTabs(p => { const n = new Set(p); n.delete(activeTabId); return n; });
    setLoading(false);
  }, [activeTabId, defaultUrl]);

  const handleBack = useCallback(async () => {
    if (!activeTabId) return;
    setLoading(true); await window.electron.chromeNavigateBack(activeTabId); updateNavButtons(); setLoading(false);
  }, [activeTabId]);

  const handleForward = useCallback(async () => {
    if (!activeTabId) return;
    setLoading(true); await window.electron.chromeNavigateForward(activeTabId); updateNavButtons(); setLoading(false);
  }, [activeTabId]);

  const handleNewTab = useCallback(async (url?: string) => {
    const r = await window.electron.chromeNewTab(url || "about:blank");
    if (r.success && r.tabId) setActiveTabId(r.tabId);
  }, []);

  const handleCloseTab = useCallback(async (tabId: string) => {
    if (tabs.length <= 1) return;
    await window.electron.chromeCloseTab(tabId);
  }, [tabs.length]);

  const handleSwitchTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return;
    setLoadingTabs(p => new Set(p).add(tabId));
    await window.electron.chromeSwitchTab(tabId);
    setLoadingTabs(p => { const n = new Set(p); n.delete(tabId); return n; });
  }, [activeTabId]);

  const handleRefresh = useCallback(async () => {
    if (!activeTabId) return;
    setLoading(true);
    await window.electron.chromeNavigate(activeTabId, urlBarRef.current?.value || currentUrl);
    setLoading(false);
  }, [activeTabId, currentUrl]);

  async function applyZoom(factor: number) {
    if (!activeTabId) return;
    const f = Math.max(0.25, Math.min(5, factor));
    await window.electron.chromeSetZoom(activeTabId, f); setZoom(f);
  }

  async function toggleMute() {
    if (!activeTabId) return;
    const nm = !muted; await window.electron.chromeSetPageMuted(activeTabId, nm); setMuted(nm);
  }

  async function toggleExtPopup() {
    if (extPopupOpen) { setExtPopupOpen(false); return; }
    try { const s = await window.electron.chromeGetExtensionState(); setExtEnabled(s.enabled); setExtMsg(s.enabled ? "UltraSurf is protecting your connection." : "UltraSurf is paused."); }
    catch { setExtEnabled(true); }
    setExtPopupOpen(true);
  }

  async function handleExtToggle(enabled: boolean) {
    await window.electron.chromeToggleExtension(enabled);
    setExtEnabled(enabled); setExtMsg(enabled ? "UltraSurf is protecting your connection." : "UltraSurf is paused.");
  }

  async function toggleFindBar() {
    if (findVisible) { closeFind(); return; }
    setFindVisible(true); setTimeout(() => findInputRef.current?.focus(), 50);
  }

  async function doFind(forward: boolean) {
    if (!findQuery || !activeTabId) return;
    const r = await window.electron.chromeFindInPage(activeTabId, findQuery, forward);
    setFindCount(r.found ? "1" : "0");
  }

  async function closeFind() {
    setFindVisible(false); setFindQuery(""); setFindCount("0");
    if (activeTabId) await window.electron.chromeClearFind(activeTabId);
  }

  function showContextMenu(e: React.MouseEvent, items: Array<{ label: string; action: () => void } | { divider: true }>) {
    e.preventDefault(); hideAllMenus();
    setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 50), items });
  }

  function hideContextMenu() { setContextMenu(null); }
  function hideTabContextMenu() { setTabContextMenu(null); }
  function hideAllMenus() { setContextMenu(null); setTabContextMenu(null); setChromeMenuOpen(false); }

  function showTabContextMenu(e: React.MouseEvent, tabId: string) {
    e.preventDefault(); hideAllMenus();
    setTabContextMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 50), tabId });
  }

  function sendMouseEvent(type: string, e: React.MouseEvent, screenRef: HTMLImageElement | null) {
    if (!activeTabId) return;
    const now = Date.now();
    if (type === "mousemove" && now - lastInputTimeRef.current < 16) return;
    lastInputTimeRef.current = now;
    const { x, y } = getRelativeCoordinates(screenRef, e.clientX, e.clientY);
    window.electron.chromeSendInput({ type, x, y, tabId: activeTabId, button: e.button === 2 ? "right" : "left", clickCount: e.detail || 1 });
  }

  function handleWheel(e: React.WheelEvent, screenRef: HTMLImageElement | null) {
    if (!activeTabId) return;
    const { x, y } = getRelativeCoordinates(screenRef, e.clientX, e.clientY);
    window.electron.chromeSendInput({ type: "wheel", x, y, deltaX: e.deltaX, deltaY: e.deltaY, tabId: activeTabId });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        if ((e.target as HTMLInputElement).id === "find-input" && e.key === "Escape") { closeFind(); urlBarRef.current?.focus(); }
        return;
      }
      switch (true) {
        case e.ctrlKey && e.key === "l": e.preventDefault(); urlBarRef.current?.focus(); urlBarRef.current?.select(); return;
        case e.ctrlKey && e.key === "t": e.preventDefault(); handleNewTab(); return;
        case e.ctrlKey && e.key === "w" && !!activeTabId: e.preventDefault(); handleCloseTab(activeTabId!); return;
        case e.ctrlKey && e.key === "r" && !!activeTabId: e.preventDefault(); handleRefresh(); return;
        case e.ctrlKey && e.key === "f": e.preventDefault(); toggleFindBar(); return;
        case e.ctrlKey && e.key === "d":
          e.preventDefault(); if (activeTabId) { const tab = tabs.find(t => t.id === activeTabId); if (tab?.url) window.electron.chromeAddBookmark(tab.url, tab.url).then(() => window.electron.chromeGetBookmarks().then(setBookmarks)); }
          return;
        case e.ctrlKey && e.key === "h": e.preventDefault(); (activeTabId ? handleNavigate : handleNewTab)("chrome://history"); return;
        case e.ctrlKey && e.key === "j": e.preventDefault(); (activeTabId ? handleNavigate : handleNewTab)("chrome://downloads"); return;
        case e.ctrlKey && e.key === "Tab" && tabs.length > 1: e.preventDefault(); const idx = tabs.findIndex(t => t.id === activeTabId); const n = tabs[(idx + 1) % tabs.length]; if (n) handleSwitchTab(n.id); return;
        case e.key === "Escape": hideAllMenus(); if (extPopupOpen) setExtPopupOpen(false); return;
      }
      if (!activeTabId) return;
      if (e.ctrlKey && e.key === "+" || e.ctrlKey && e.key === "=") { e.preventDefault(); applyZoom(zoom + 0.25); return; }
      if (e.ctrlKey && e.key === "-") { e.preventDefault(); applyZoom(zoom - 0.25); return; }
      if (e.ctrlKey && e.key === "0") { e.preventDefault(); applyZoom(1); return; }
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("ctrl"); if (e.altKey) mods.push("alt"); if (e.shiftKey) mods.push("shift"); if (e.metaKey) mods.push("meta");
      window.electron.chromeSendInput({ type: "keydown", key: e.key, code: e.code, keyCode: e.keyCode, tabId: activeTabId, autoRepeat: e.repeat, modifiers: mods.length > 0 ? mods : undefined });
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!activeTabId) return;
      window.electron.chromeSendInput({ type: "keyup", key: e.key, code: e.code, keyCode: e.keyCode, tabId: activeTabId });
    }
    document.addEventListener("keydown", onKeyDown); document.addEventListener("keyup", onKeyUp);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("keyup", onKeyUp); };
  }, [activeTabId, handleNewTab, handleCloseTab, handleNavigate, handleRefresh, tabs, zoom, findVisible, findQuery, extPopupOpen]);

  const activeTab = tabs.find(t => t.active);
  const urlSecurity = activeTab?.url?.startsWith("https://") ? "secure" : activeTab?.url?.startsWith("chrome://") || activeTab?.url?.startsWith("about:") ? "" : "insecure";
  const urlLockIcon = urlSecurity === "secure" ? "\uD83D\uDD12" : urlSecurity === "insecure" ? "\u26A0" : "";

  async function retryLaunch() {
    setLaunchError(null); setSetupStatus("Iniciando..."); setSetupProgress(0); setLoading(true);
    try { const r = await window.electron.chromeSetupAndLaunch(mirrorId); if (!r.success) setLaunchError(r.error || "Erro"); else { setSetupStatus(null); setLoading(false); } }
    catch (err: any) { setLaunchError(err.message); setLoading(false); setSetupStatus(null); }
  }

  return {
    urlBarRef, findInputRef, contextMenuRef, tabContextMenuRef, chromeDropdownRef,
    tabs, activeTabId, loadingTabs, currentUrl, inputUrl, canGoBack, canGoFwd,
    loading, launchError, setupStatus, setupProgress, activeTab,
    zoom, muted, bookmarks, extensions, extPopupOpen, extEnabled, extMsg,
    findVisible, findQuery, findCount, chromeMenuOpen,
    contextMenu, tabContextMenu, urlSecurity, urlLockIcon,
    setInputUrl, setBookmarks, setFindQuery, setChromeMenuOpen, setExtPopupOpen, setFindCount,
    handleNavigate, handleBack, handleForward, handleNewTab, handleCloseTab, handleSwitchTab, handleRefresh,
    applyZoom, toggleMute, toggleExtPopup, handleExtToggle, toggleFindBar, doFind, closeFind,
    showContextMenu, hideContextMenu, hideTabContextMenu, showTabContextMenu, hideAllMenus,
    sendMouseEvent, handleWheel, retryLaunch,
  };
}
