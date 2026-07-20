import { useEffect, useRef, useCallback } from "react";
import "./BrowserView.scss";
import type { BrowserMirrorProps } from "./types";
import { useBrowserMirror } from "./hooks/useBrowserMirror";
import { BrowserTabBar } from "./BrowserTabBar";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserBookmarksBar } from "./BrowserBookmarksBar";
import { BrowserFindBar } from "./BrowserFindBar";
import { BrowserViewport } from "./BrowserViewport";
import { BrowserSetupScreen } from "./BrowserSetupScreen";
import { BrowserLaunchError } from "./BrowserLaunchError";
import { BrowserDebugBar } from "./BrowserDebugBar";

export function BrowserMirror({ defaultUrl = "https://www.nexusmods.com", mirrorId }: BrowserMirrorProps) {
  const screenRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const h = useBrowserMirror(mirrorId, defaultUrl);

  const handleMouseEvent = useCallback((type: string, e: React.MouseEvent) => {
    h.sendMouseEvent(type, e, screenRef.current);
  }, [h.sendMouseEvent]);

  const handleWheelEvent = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      h.applyZoom(h.zoom + (e.deltaY > 0 ? -0.1 : 0.1));
      return;
    }
    h.handleWheel(e, screenRef.current);
  }, [h.handleWheel, h.applyZoom, h.zoom]);

  useEffect(() => {
    if (!viewportRef.current || !h.activeTabId) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0 && e.contentRect.height > 0)
          window.electron.chromeResizeViewport(Math.round(e.contentRect.width), Math.round(e.contentRect.height));
      }
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [h.activeTabId]);

  if (h.setupStatus) return <BrowserSetupScreen status={h.setupStatus} progress={h.setupProgress} />;
  if (h.launchError) return <BrowserLaunchError error={h.launchError} onRetry={h.retryLaunch} />;

  return (
    <div className="browser-view">
      <BrowserDebugBar mirrorId={mirrorId} />

      <BrowserTabBar
        tabs={h.tabs}
        loadingTabs={h.loadingTabs}
        onSwitchTab={h.handleSwitchTab}
        onCloseTab={h.handleCloseTab}
        onNewTab={h.handleNewTab}
        onTabContextMenu={h.showTabContextMenu}
      />

      <BrowserToolbar
        inputUrl={h.inputUrl}
        canGoBack={h.canGoBack}
        canGoFwd={h.canGoFwd}
        zoom={h.zoom}
        muted={h.muted}
        bookmarks={h.bookmarks}
        extensions={h.extensions}
        urlSecurity={h.urlSecurity}
        urlLockIcon={h.urlLockIcon}
        chromeMenuOpen={h.chromeMenuOpen}
        chromeDropdownRef={h.chromeDropdownRef as React.RefObject<HTMLDivElement>}
        urlBarRef={h.urlBarRef as React.RefObject<HTMLInputElement>}
        onInputUrlChange={h.setInputUrl}
        onNavigate={() => h.handleNavigate()}
        onBack={h.handleBack}
        onForward={h.handleForward}
        onRefresh={h.handleRefresh}
        onApplyZoom={h.applyZoom}
        onToggleMute={h.toggleMute}
        onToggleExtPopup={h.toggleExtPopup}
        onChromeMenuToggle={() => h.setChromeMenuOpen(!h.chromeMenuOpen)}
        onChromeMenuItemClick={(url) => {
          h.setChromeMenuOpen(false);
          if (h.activeTabId) h.handleNavigate(url);
          else h.handleNewTab(url);
        }}
      />

      <BrowserBookmarksBar
        bookmarks={h.bookmarks}
        activeTabId={h.activeTabId}
        tabs={h.tabs}
        onNavigate={h.handleNavigate}
        onNewTab={h.handleNewTab}
        onBookmarksChanged={h.setBookmarks}
        onShowContextMenu={h.showContextMenu}
      />

      <BrowserFindBar
        findVisible={h.findVisible}
        findQuery={h.findQuery}
        findCount={h.findCount}
        findInputRef={h.findInputRef}
        onFindQueryChange={(q) => { h.setFindQuery(q); if (!q) h.setFindCount("0"); }}
        onDoFind={h.doFind}
        onCloseFind={() => { h.closeFind(); h.urlBarRef.current?.focus(); }}
      />

      {h.loading && (
        <div className="browser-view__loading-bar">
          <div className="browser-view__loading-progress" />
        </div>
      )}

      <BrowserViewport
        mirrorId={mirrorId}
        loading={h.loading}
        activeTabId={h.activeTabId}
        tabs={h.tabs}
        extPopupOpen={h.extPopupOpen}
        extensions={h.extensions}
        extEnabled={h.extEnabled}
        extMsg={h.extMsg}
        contextMenu={h.contextMenu}
        tabContextMenu={h.tabContextMenu}
        screenRef={screenRef}
        viewportRef={viewportRef}
        contextMenuRef={h.contextMenuRef as React.RefObject<HTMLDivElement>}
        tabContextMenuRef={h.tabContextMenuRef as React.RefObject<HTMLDivElement>}
        onSendMouseEvent={handleMouseEvent}
        onWheel={handleWheelEvent}
        onShowContextMenu={h.showContextMenu}
        onHideContextMenu={h.hideContextMenu}
        onHideTabContextMenu={h.hideTabContextMenu}
        onSetExtPopupOpen={h.setExtPopupOpen}
        onExtToggle={h.handleExtToggle}
        onBack={h.handleBack}
        onForward={h.handleForward}
        onRefresh={h.handleRefresh}
        onNewTab={h.handleNewTab}
        onNavigate={h.handleNavigate}
        onCloseTab={h.handleCloseTab}
      />
    </div>
  );
}
