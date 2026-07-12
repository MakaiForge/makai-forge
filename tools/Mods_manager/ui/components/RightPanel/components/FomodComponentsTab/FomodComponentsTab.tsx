import type { FomodComponent } from "@types";

interface ConflictInfo {
  modName: string;
  files: string[];
}

interface FomodComponentsTabProps {
  components: FomodComponent[];
  onToggle: (componentName: string) => void;
  onReconfigure: () => void;
  conflicts?: ConflictInfo[];
}

export function FomodComponentsTab({ components, onToggle, onReconfigure, conflicts }: FomodComponentsTabProps) {
  const hasConflicts = conflicts && conflicts.length > 0;

  const isComponentConflicting = (component: FomodComponent): ConflictInfo | null => {
    if (!conflicts) return null;
    for (const conflict of conflicts) {
      for (const conflictFile of conflict.files) {
        if (component.files.some(f => f.toLowerCase() === conflictFile.toLowerCase())) {
          return conflict;
        }
      }
    }
    return null;
  };

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

      {hasConflicts && (
        <div className="mod-manager__fomod-conflict-banner">
          ⚠️ Some components conflict with other mods. Disable conflicting components to resolve.
        </div>
      )}

      <div className="mod-manager__fomod-list">
        {components.map((component) => {
          const conflict = isComponentConflicting(component);
          return (
            <label
              key={component.name}
              className={[
                "mod-manager__fomod-component",
                component.enabled ? "mod-manager__fomod-component--enabled" : "",
                conflict ? "mod-manager__fomod-component--conflict" : "",
              ].filter(Boolean).join(" ")}
            >
              <input
                type="checkbox"
                checked={component.enabled}
                onChange={() => onToggle(component.name)}
                className="mod-manager__fomod-checkbox"
              />
              <div className="mod-manager__fomod-info">
                <span className="mod-manager__fomod-name">
                  {component.name}
                  {conflict && <span className="mod-manager__fomod-conflict-badge">⚠ {conflict.modName}</span>}
                </span>
                {component.description && (
                  <span className="mod-manager__fomod-desc">{component.description}</span>
                )}
                <span className="mod-manager__fomod-files">
                  {component.files.length} file{component.files.length !== 1 ? "s" : ""}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      <div className="mod-manager__fomod-summary">
        {components.filter(c => c.enabled).length} / {components.length} components enabled
        {hasConflicts && ` • ${conflicts!.length} conflict(s)`}
      </div>
    </div>
  );
}