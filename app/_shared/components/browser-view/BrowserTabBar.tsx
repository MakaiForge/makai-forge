import { useCallback } from "react";
import type { TabInfo } from "./types";
import { getFaviconUrl, getDomain } from "./utils";

interface Props {
  tabs: TabInfo[];
  loadingTabs: Set<string>;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (url?: string) => void;
  onTabContextMenu: (e: React.MouseEvent, tabId: string) => void;
}

export function BrowserTabBar({ tabs, loadingTabs, onSwitchTab, onCloseTab, onNewTab, onTabContextMenu }: Props) {
  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData("text/plain", tabId);
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain");
    // Drag-drop reorder is handled client-side by the parent
    if (fromId && targetId && fromId !== targetId) {
      // The parent will reorder based on updated tab list from main
    }
  }, []);

  return (
    <div className="browser-view__titlebar">
      <div
        className="browser-view__tabs"
        onContextMenu={(e) => {
          const tabEl = (e.target as HTMLElement).closest("[data-tab-id]");
          if (tabEl) {
            onTabContextMenu(e, (tabEl as HTMLElement).dataset.tabId!);
          }
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={`browser-view__tab${tab.active ? " browser-view__tab--active" : ""}`}
            draggable
            onClick={() => onSwitchTab(tab.id)}
            onDragStart={(e) => handleTabDragStart(e, tab.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleTabDrop(e, tab.id)}
          >
            {(() => {
              const favUrl = getFaviconUrl(tab.url);
              return favUrl ? (
                <img
                  className="tab-favicon"
                  src={favUrl}
                  alt=""
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : null;
            })()}
            {loadingTabs.has(tab.id) && <span className="tab-spinner">&#x27B3;</span>}
            <span className="tab-title">
              {tab.url ? getDomain(tab.url) || tab.url : "Nova aba"}
            </span>
            {tab.audible && (
              <span className="tab-audio" title="A reproduzir áudio">&#x1F50A;</span>
            )}
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                tabIndex={-1}
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="browser-view__newtab-btn" onClick={() => onNewTab()} title="Nova aba">+</button>
    </div>
  );
}
