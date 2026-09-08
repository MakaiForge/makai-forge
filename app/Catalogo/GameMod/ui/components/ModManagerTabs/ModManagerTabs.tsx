type TabId = "mods" | "navegador";

interface ModManagerTabsProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export function ModManagerTabs({ activeTab, onChange }: ModManagerTabsProps) {
  return (
    <div className="mod-manager__tabs">
      <button
        className={`mod-manager__tab-main ${activeTab === "mods" ? "mod-manager__tab-main--active" : ""}`}
        onClick={() => onChange("mods")}
      >
        Mod Manager
      </button>
      <button
        className={`mod-manager__tab-main ${activeTab === "navegador" ? "mod-manager__tab-main--active" : ""}`}
        onClick={() => onChange("navegador")}
      >
        Navegador Manager
      </button>
    </div>
  );
}
