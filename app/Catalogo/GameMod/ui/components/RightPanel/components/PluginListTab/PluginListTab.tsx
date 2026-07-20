import type { PluginEntry } from "../../../../types/mod.types";

interface PluginListTabProps {
  plugins: PluginEntry[];
  onToggle: (pluginName: string) => void;
}

export function PluginListTab({ plugins, onToggle }: PluginListTabProps) {
  return (
    <div className="mod-manager__modfiles-tab">
      <div className="mod-manager__plugins-header">
        <span>Profile Plugins (all enabled mods)</span>
        <span className="mod-manager__plugins-count">{plugins.length} total</span>
      </div>
      {plugins.length === 0 ? (
        <p className="mod-manager__tab-placeholder">No plugins found. Install mods with .esp/.esm/.esl files.</p>
      ) : (
        <div className="mod-manager__plugins-list">
          {plugins.map((p, idx) => (
            <div key={idx} className="mod-manager__plugin-row">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={() => onToggle(p.name)}
              />
              <span className="mod-manager__plugin-name">{p.name}</span>
              {p.modName && (
                <span className="mod-manager__plugin-mod">{p.modName}</span>
              )}
              <span className="mod-manager__plugin-type">
                {p.name.toLowerCase().endsWith(".esm") ? "ESM" :
                 p.name.toLowerCase().endsWith(".esl") ? "ESL" : "ESP"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
