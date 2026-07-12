import { FomodPluginRow } from "../FomodPluginRow";
import type { FomodGroup } from "../../../../types/fomod.types";
import "./FomodGroupPanel.scss";

interface FomodGroupPanelProps {
  group: FomodGroup;
  stepIndex: number;
  groupIndex: number;
  onTogglePlugin: (stepIndex: number, groupIndex: number, pluginIndex: number) => void;
}

const typeLabels: Record<string, string> = {
  SelectAll: "Select all that apply",
  SelectAtLeastOne: "Select at least one",
  SelectAtMostOne: "Select at most one",
  SelectExactlyOne: "Select exactly one",
  SelectAny: "Select any",
};

export function FomodGroupPanel({ group, stepIndex, groupIndex, onTogglePlugin }: FomodGroupPanelProps) {
  return (
    <div className="fomod-group-panel">
      <div className="fomod-group-panel__header">
        <span className="fomod-group-panel__name">{group.name}</span>
        <span className="fomod-group-panel__type">{typeLabels[group.type] ?? group.type}</span>
      </div>
      <div className="fomod-group-panel__plugins">
        {group.plugins?.map((plugin, pi) => (
          <FomodPluginRow
            key={`${pi}-${plugin.name}`}
            plugin={plugin}
            groupType={group.type}
            selected={plugin.selected}
            onToggle={() => onTogglePlugin(stepIndex, groupIndex, pi)}
          />
        ))}
      </div>
    </div>
  );
}
