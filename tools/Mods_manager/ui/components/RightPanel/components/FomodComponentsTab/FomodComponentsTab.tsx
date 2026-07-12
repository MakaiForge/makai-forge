import type { FomodComponent } from "@types";

interface FomodComponentsTabProps {
  components: FomodComponent[];
  onToggle: (componentName: string) => void;
  onReconfigure: () => void;
}

export function FomodComponentsTab({ components, onToggle, onReconfigure }: FomodComponentsTabProps) {
  if (components.length === 0) {
    return (
      <div className="mod-manager__fomod-empty">
        <p>No FOMOD components available.</p>
        <p className="mod-manager__fomod-hint">
          Install a mod with FOMOD support to see components here.
        </p>
      </div>
    );
  }

  return (
    <div className="mod-manager__fomod-components">
      <div className="mod-manager__fomod-header">
        <span className="mod-manager__fomod-title">FOMOD Components</span>
        <button
          className="mod-manager__fomod-reconfigure-btn"
          onClick={onReconfigure}
        >
          Reconfigure FOMOD
        </button>
      </div>

      <div className="mod-manager__fomod-list">
        {components.map((component) => (
          <label
            key={component.name}
            className={`mod-manager__fomod-component ${component.enabled ? "mod-manager__fomod-component--enabled" : ""}`}
          >
            <input
              type="checkbox"
              checked={component.enabled}
              onChange={() => onToggle(component.name)}
              className="mod-manager__fomod-checkbox"
            />
            <div className="mod-manager__fomod-info">
              <span className="mod-manager__fomod-name">{component.name}</span>
              {component.description && (
                <span className="mod-manager__fomod-desc">{component.description}</span>
              )}
              <span className="mod-manager__fomod-files">
                {component.files.length} file{component.files.length !== 1 ? "s" : ""}
              </span>
            </div>
          </label>
        ))}
      </div>

      <div className="mod-manager__fomod-summary">
        {components.filter(c => c.enabled).length} / {components.length} components enabled
      </div>
    </div>
  );
}