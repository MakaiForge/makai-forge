import { IniEditorTab } from "./components/IniEditorTab/IniEditorTab";
import { PluginListTab } from "./components/PluginListTab/PluginListTab";
import { ModFilesTab } from "./components/ModFilesTab/ModFilesTab";
import { DataFolderTab } from "./components/DataFolderTab/DataFolderTab";
import { FomodComponentsTab } from "./components/FomodComponentsTab/FomodComponentsTab";
import type { ModlistEntry, PluginEntry, FileTreeEntry } from "../../types/mod.types";
import type { FomodComponent } from "@types";

type RightTab = "files" | "ini" | "data" | "fomod";

interface RightPanelProps {
  selectedMod: ModlistEntry | null;
  plugins: PluginEntry[];
  modFiles: FileTreeEntry[];
  excludedFiles: Set<string>;
  dataFolderEntries: FileTreeEntry[];
  iniFiles: { name: string; path: string; content: string }[];
  selectedIni: string | null;
  iniContent: string;
  activeRightTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  onTogglePlugin: (pluginName: string) => void;
  onToggleExclude: (path: string) => void;
  onIniSelect: (path: string, content: string) => void;
  onIniChange: (content: string) => void;
  fomodComponents: FomodComponent[];
  onToggleFomodComponent: (componentName: string) => void;
  onReconfigureFomod: () => void;
  fomodConflicts?: { modName: string; files: string[] }[];
}

const tabs: { id: RightTab; label: string }[] = [
  { id: "files", label: "Mod Files" },
  { id: "ini", label: "INI" },
  { id: "data", label: "Data Folder" },
];

export function RightPanel({
  selectedMod, plugins, modFiles, excludedFiles, dataFolderEntries,
  iniFiles, selectedIni, iniContent,
  activeRightTab, onTabChange,
  onTogglePlugin, onToggleExclude,
  onIniSelect, onIniChange,
  fomodComponents, onToggleFomodComponent, onReconfigureFomod,
  fomodConflicts,
}: RightPanelProps) {
  const hasFomod = selectedMod?.hasFomod || fomodComponents.length > 0;
  const rightTabs = hasFomod
    ? [...tabs, { id: "fomod" as RightTab, label: "FOMOD" }]
    : tabs;

  return (
    <>
      <div className="mod-manager__right-tabs">
        {rightTabs.map(t => (
          <button
            key={t.id}
            className={`mod-manager__tab ${activeRightTab === t.id ? "mod-manager__tab--active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mod-manager__right-content">
        {activeRightTab === "files" && selectedMod && (
          <ModFilesTab
            files={modFiles}
            excludedFiles={excludedFiles}
            onToggleExclude={onToggleExclude}
            modName={selectedMod.name}
            modStagingDir={selectedMod.stagingDir}
          />
        )}
        {activeRightTab === "files" && !selectedMod && (
          <PluginListTab
            plugins={plugins}
            onToggle={onTogglePlugin}
          />
        )}
        {activeRightTab === "ini" && (
          <IniEditorTab
            iniFiles={iniFiles}
            selectedIni={selectedIni}
            iniContent={iniContent}
            onSelect={onIniSelect}
            onChange={onIniChange}
          />
        )}
        {activeRightTab === "data" && (
          <DataFolderTab
            entries={dataFolderEntries}
          />
        )}
        {activeRightTab === "fomod" && (
          <FomodComponentsTab
            components={fomodComponents}
            onToggle={onToggleFomodComponent}
            onReconfigure={onReconfigureFomod}
            conflicts={fomodConflicts}
          />
        )}
      </div>
    </>
  );
}
