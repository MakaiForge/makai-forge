import { Plus, ExternalLink } from "lucide-react";
import type { RomSite } from "@emulators/types";

interface SitesTabsProps {
  sites: RomSite[];
  activeTab: string | null;
  onSelectTab: (url: string | null) => void;
  onAddSite: () => void;
}

export function SitesTabs({ sites, activeTab, onSelectTab, onAddSite }: SitesTabsProps) {
  return (
    <div className="emulator-detail__tabs">
      {sites.map((site, idx) => (
        <button
          key={`${site.url}-${idx}`}
          type="button"
          className={`emulator-detail__tab ${activeTab === site.url ? "emulator-detail__tab--active" : ""}`}
          onClick={() => onSelectTab(activeTab === site.url ? null : site.url)}
        >
          <span>{site.name}</span>
          <ExternalLink
            size={12}
            className="emulator-detail__tab-open"
            onClick={(e) => {
              e.stopPropagation();
              window.electron.openExternal(site.url);
            }}
          />
        </button>
      ))}
      <button type="button" className="emulator-detail__tab-add" onClick={onAddSite} title="Adicionar site">
        <Plus size={14} />
      </button>
    </div>
  );
}
