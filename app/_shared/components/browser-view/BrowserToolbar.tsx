import { CHROME_MENU_ITEMS, getDomain } from "./utils";
import type { ExtInfo } from "./types";

interface Props {
  inputUrl: string;
  canGoBack: boolean;
  canGoFwd: boolean;
  zoom: number;
  muted: boolean;
  bookmarks: Array<{ url: string; title: string }>;
  extensions: ExtInfo[];
  urlSecurity: string;
  urlLockIcon: string;
  chromeMenuOpen: boolean;
  chromeDropdownRef: React.RefObject<HTMLDivElement>;
  urlBarRef: React.RefObject<HTMLInputElement>;
  onInputUrlChange: (url: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onApplyZoom: (factor: number) => void;
  onToggleMute: () => void;
  onToggleExtPopup: () => void;
  onChromeMenuToggle: () => void;
  onChromeMenuItemClick: (url: string) => void;
}

export function BrowserToolbar({
  inputUrl, canGoBack, canGoFwd, zoom, muted, bookmarks, extensions,
  urlSecurity, urlLockIcon, chromeMenuOpen, chromeDropdownRef, urlBarRef,
  onInputUrlChange, onNavigate, onBack, onForward, onRefresh,
  onApplyZoom, onToggleMute, onToggleExtPopup, onChromeMenuToggle, onChromeMenuItemClick,
}: Props) {
  return (
    <div className="browser-view__toolbar">
      <button className="browser-view__btn" onClick={onBack} disabled={!canGoBack} title="Voltar">&larr;</button>
      <button className="browser-view__btn" onClick={onForward} disabled={!canGoFwd} title="Avançar">&rarr;</button>
      <button className="browser-view__btn" onClick={onRefresh} title="Recarregar">&circledR;</button>

      <span className={`url-lock ${urlSecurity || ""}`}>{urlLockIcon}</span>

      <div className="browser-view__url-bar">
        <input
          ref={urlBarRef}
          type="text"
          className="browser-view__url-input"
          value={inputUrl}
          onChange={(e) => onInputUrlChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onNavigate(); }}
          onFocus={(e) => e.target.select()}
          placeholder="Digite uma URL..."
          list="url-suggestions"
        />
        <datalist id="url-suggestions">
          {bookmarks.map((bm, i) => (
            <option key={i} value={bm.url} />
          ))}
        </datalist>
      </div>

      <div className="browser-view__zoom-controls">
        <button className="browser-view__btn" onClick={() => onApplyZoom(zoom - 0.25)} title="Reduzir zoom">&minus;</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="browser-view__btn" onClick={() => onApplyZoom(zoom + 0.25)} title="Aumentar zoom">+</button>
      </div>

      <button className={`browser-view__btn${muted ? " active" : ""}`} onClick={onToggleMute} title={muted ? "Ativar áudio" : "Mutar áudio"}>
        {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
      </button>

      {extensions.length > 0 && (
        <div className="browser-view__ext-icons">
          {extensions.map((ext) => (
            <div key={ext.id} className="browser-view__ext-icon" title={ext.name} onClick={onToggleExtPopup}>
              <img src={ext.icon} alt={ext.name} draggable={false} />
              <div className="ext-badge" />
            </div>
          ))}
        </div>
      )}

      <div className="browser-view__chrome-menu">
        <button className="browser-view__btn" onClick={(e) => { e.stopPropagation(); onChromeMenuToggle(); }} title="Menu Chrome">
          &#x22EE;
        </button>
        <div ref={chromeDropdownRef} className={`browser-view__chrome-dropdown${chromeMenuOpen ? "" : " hidden"}`}>
          {CHROME_MENU_ITEMS.map((item, i) =>
            "divider" in item ? (
              <div key={i} className="dropdown-divider" />
            ) : (
              <div
                key={i}
                className="dropdown-item"
                onClick={() => onChromeMenuItemClick(item.url)}
              >
                {item.label}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
