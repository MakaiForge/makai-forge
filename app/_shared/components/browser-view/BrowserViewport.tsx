import { useRef, useEffect } from "react";
import type { ExtInfo, TabInfo } from "./types";

interface ContextMenuItem {
  label: string;
  action: () => void;
}

interface ContextMenuData {
  x: number;
  y: number;
  items: Array<{ label: string; action: () => void } | { divider: true }>;
}

interface TabContextMenuData {
  x: number;
  y: number;
  tabId: string;
}

interface Props {
  mirrorId: string;
  loading: boolean;
  activeTabId: string | null;
  tabs: TabInfo[];
  extPopupOpen: boolean;
  extensions: ExtInfo[];
  extEnabled: boolean;
  extMsg: string;
  contextMenu: ContextMenuData | null;
  tabContextMenu: TabContextMenuData | null;
  screenRef: React.RefObject<HTMLImageElement>;
  viewportRef: React.RefObject<HTMLDivElement>;
  contextMenuRef: React.RefObject<HTMLDivElement>;
  tabContextMenuRef: React.RefObject<HTMLDivElement>;
  onSendMouseEvent: (type: string, e: React.MouseEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
  onShowContextMenu: (e: React.MouseEvent, items: Array<{ label: string; action: () => void } | { divider: true }>) => void;
  onHideContextMenu: () => void;
  onHideTabContextMenu: () => void;
  onSetExtPopupOpen: (open: boolean) => void;
  onExtToggle: (enabled: boolean) => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onNewTab: (url?: string) => void;
  onNavigate: (url: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function BrowserViewport({
  mirrorId, loading, activeTabId, tabs, extPopupOpen, extensions, extEnabled, extMsg,
  contextMenu, tabContextMenu,
  screenRef, viewportRef, contextMenuRef, tabContextMenuRef,
  onSendMouseEvent, onWheel, onShowContextMenu, onHideContextMenu, onHideTabContextMenu,
  onSetExtPopupOpen, onExtToggle, onBack, onForward, onRefresh, onNewTab, onNavigate, onCloseTab,
}: Props) {
  const prevBlobUrlRef = useRef<string>("");

  useEffect(() => {
    const frameCleanup = window.electron.onChromeScreencastFrame((frame: any) => {
      if (mirrorId && frame.mirrorId !== mirrorId) return;
      if (!screenRef.current) return;
      if (typeof frame.data === "string") {
        screenRef.current.src = `data:image/jpeg;base64,${frame.data}`;
      } else if (frame.data instanceof Uint8Array || frame.data instanceof ArrayBuffer) {
        const blob = new Blob([frame.data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        screenRef.current.src = url;
        if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = url;
      }
    });
    return () => {
      frameCleanup();
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    };
  }, [mirrorId]);

  const activeTab = tabs.find((t) => t.active);

  return (
    <div ref={viewportRef} className="browser-view__content">
      {loading && (
        <div className="browser-view__loading">
          <div className="browser-view__spinner" />
        </div>
      )}

      <img
        ref={screenRef}
        className="browser-view__mirror-screen"
        alt=""
        draggable={false}
        tabIndex={0}
        onError={() => console.error("[BrowserMirror] img onError")}
        onLoad={() => console.log("[BrowserMirror] img loaded OK")}
        onMouseDown={(e) => {
          (e.target as HTMLImageElement).focus();
          onSendMouseEvent("mousedown", e);
        }}
        onMouseUp={(e) => onSendMouseEvent("mouseup", e)}
        onMouseMove={(e) => {
          if (e.buttons > 0) onSendMouseEvent("mousemove", e);
        }}
        onWheel={onWheel}
        onContextMenu={(e) => {
          if (activeTabId) {
            onShowContextMenu(e, [
              { label: "Voltar", action: onBack },
              { label: "Avançar", action: onForward },
              { label: "Recarregar", action: onRefresh },
              { divider: true as const },
              { label: "Nova aba", action: () => onNewTab() },
              { divider: true as const },
              { label: "Copiar URL", action: () => { if (activeTab?.url) navigator.clipboard.writeText(activeTab.url).catch(() => {}); } },
              {
                label: "Colar e ir",
                action: () => {
                  navigator.clipboard.readText().then((text) => {
                    if (text && activeTabId) onNavigate(text);
                  }).catch(() => {});
                },
              },
              { divider: true as const },
              {
                label: "Ver código fonte",
                action: () => { if (activeTab?.url && activeTabId) onNavigate("view-source:" + activeTab.url); },
              },
              { label: "Inspecionar", action: () => { if (activeTabId) window.electron.chromeOpenDevtools(activeTabId); } },
            ]);
          }
        }}
        onClick={(e) => (e.target as HTMLImageElement)?.focus()}
      />

      {extPopupOpen && (
        <>
          <div className="browser-view__ext-popup-backdrop" onClick={() => onSetExtPopupOpen(false)} />
          <div className="browser-view__ext-popup">
            <div className="ext-popup-header">
              {extensions[0] && <img src={extensions[0].icon} alt={extensions[0].name} />}
              <div>
                <div className="ext-popup-title">UltraSurf</div>
                <div className="ext-popup-subtitle">Security, Privacy &amp; Freedom VPN</div>
              </div>
            </div>
            <div className="ext-popup-body">
              <div className="ext-popup-row">
                <div>
                  <div className="ext-popup-label">Status</div>
                  <div className="ext-popup-value">{extEnabled ? "Enabled" : "Disabled"}</div>
                </div>
                <label className="ext-popup-switch">
                  <input type="checkbox" checked={extEnabled} onChange={(e) => onExtToggle(e.target.checked)} />
                  <span className="ext-popup-slider" />
                </label>
              </div>
              <div className="ext-popup-message">{extMsg}</div>
            </div>
          </div>
        </>
      )}

      <div
        ref={contextMenuRef}
        className={`browser-view__context-menu${contextMenu ? "" : " hidden"}`}
        style={contextMenu ? { left: contextMenu.x, top: contextMenu.y } : undefined}
      >
        {contextMenu?.items.map((item, i) =>
          "divider" in item ? (
            <div key={i} className="context-divider" />
          ) : (
            <div
              key={i}
              className="context-item"
              onClick={(e) => {
                e.stopPropagation();
                item.action();
                onHideContextMenu();
              }}
            >
              {item.label}
            </div>
          )
        )}
      </div>

      <div
        ref={tabContextMenuRef}
        className={`browser-view__tab-context-menu${tabContextMenu ? " show" : ""}`}
        style={tabContextMenu ? { left: tabContextMenu.x, top: tabContextMenu.y } : undefined}
      >
        {tabContextMenu && (() => {
          const tabId = tabContextMenu.tabId;
          const otherTabs = tabs.filter((t) => t.id !== tabId);
          const tabIdx = tabs.findIndex((t) => t.id === tabId);
          const rightTabs = tabs.slice(tabIdx + 1);
          const menuTab = tabs.find((t) => t.id === tabId);
          const items: Array<{ label: string; action: () => void; disabled?: boolean } | { divider: true }> = [
            { label: "Recarregar", action: () => { if (activeTabId === tabId) onRefresh(); } },
            { label: "Duplicar", action: () => { if (menuTab) onNewTab(menuTab.url); } },
            { divider: true as const },
            { label: "Fechar aba", action: () => onCloseTab(tabId), disabled: tabs.length <= 1 },
            { label: `Fechar outras abas (${otherTabs.length})`, action: () => { otherTabs.forEach((t: TabInfo) => window.electron.chromeCloseTab(t.id)); }, disabled: otherTabs.length === 0 },
            { label: `Fechar abas à direita (${rightTabs.length})`, action: () => { rightTabs.forEach((t: TabInfo) => window.electron.chromeCloseTab(t.id)); }, disabled: rightTabs.length === 0 },
          ];
          return items.map((item, i) =>
            "divider" in item ? (
              <div key={i} className="context-divider" />
            ) : (
              <div
                key={i}
                className={`context-item${item.disabled ? " disabled" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.disabled) {
                    item.action();
                    onHideTabContextMenu();
                  }
                }}
              >
                {item.label}
              </div>
            )
          );
        })()}
      </div>
    </div>
  );
}
