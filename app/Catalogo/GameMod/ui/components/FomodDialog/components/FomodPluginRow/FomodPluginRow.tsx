import type { FomodPlugin } from "../../../../types/fomod.types";
import "./FomodPluginRow.scss";

interface FomodPluginRowProps {
  plugin: FomodPlugin;
  groupType: string;
  selected: boolean;
  onToggle: () => void;
}

export function FomodPluginRow({ plugin, groupType, selected, onToggle }: FomodPluginRowProps) {
  const isRadio = groupType === "SelectExactlyOne" || groupType === "SelectAtMostOne";

  return (
    <label className={`fomod-plugin-row ${selected ? "fomod-plugin-row--selected" : ""}`}>
      <input
        type={isRadio ? "radio" : "checkbox"}
        checked={selected}
        onChange={onToggle}
        name={isRadio ? `group-${groupType}` : undefined}
      />
      <div className="fomod-plugin-row__body">
        <span className="fomod-plugin-row__name">{plugin.name}</span>
        {plugin.description && (
          <span className="fomod-plugin-row__desc">{plugin.description}</span>
        )}
      </div>
      {plugin.type && <span className="fomod-plugin-row__type">{plugin.type}</span>}
    </label>
  );
}
