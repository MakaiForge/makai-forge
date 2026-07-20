import { getDomain } from "./utils";

interface Props {
  bookmarks: Array<{ url: string; title: string }>;
  activeTabId: string | null;
  tabs: Array<{ id: string; url: string }>;
  onNavigate: (url: string) => void;
  onNewTab: (url?: string) => void;
  onBookmarksChanged: (bms: Array<{ url: string; title: string }>) => void;
  onShowContextMenu: (e: React.MouseEvent, items: Array<{ label: string; action: () => void } | { divider: true }>) => void;
}

export function BrowserBookmarksBar({ bookmarks, activeTabId, tabs, onNavigate, onNewTab, onBookmarksChanged, onShowContextMenu }: Props) {
  if (bookmarks.length === 0) return null;

  return (
    <div
      className="browser-view__bookmarks-bar"
      onContextMenu={(e) => {
        const item = (e.target as HTMLElement).closest("[data-url]");
        if (!item) {
          onShowContextMenu(e, [{ label: "Nova aba", action: () => onNewTab() }]);
        } else {
          const url = (item as HTMLElement).dataset.url!;
          onShowContextMenu(e, [
            { label: "Abrir", action: () => onNavigate(url) },
            { label: "Abrir em nova aba", action: () => onNewTab(url) },
            { divider: true as const },
            { label: "Copiar URL", action: () => navigator.clipboard.writeText(url).catch(() => {}) },
            { divider: true as const },
            {
              label: "Remover favorito",
              action: async () => {
                await window.electron.chromeRemoveBookmark(url);
                const bms = await window.electron.chromeGetBookmarks();
                onBookmarksChanged(bms);
              },
            },
          ]);
        }
      }}
    >
      <span
        className="bookmark-add-btn"
        title="Adicionar página atual aos favoritos"
        onClick={async () => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab?.url) return;
          await window.electron.chromeAddBookmark(tab.url, tab.url);
          const bms = await window.electron.chromeGetBookmarks();
          onBookmarksChanged(bms);
        }}
      >
        +
      </span>
      {bookmarks.map((bm, i) => (
        <div
          key={i}
          className="bookmark-item"
          title={bm.url}
          data-url={bm.url}
          onClick={() => onNavigate(bm.url)}
        >
          <img
            className="bookmark-icon"
            src={`https://icons.duckduckgo.com/ip3/${getDomain(bm.url)}.ico`}
            alt=""
            loading="lazy"
            draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="bookmark-label">{bm.title}</span>
          <button
            className="bookmark-remove"
            onClick={async (e) => {
              e.stopPropagation();
              await window.electron.chromeRemoveBookmark(bm.url);
              const bms = await window.electron.chromeGetBookmarks();
              onBookmarksChanged(bms);
            }}
            tabIndex={-1}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
