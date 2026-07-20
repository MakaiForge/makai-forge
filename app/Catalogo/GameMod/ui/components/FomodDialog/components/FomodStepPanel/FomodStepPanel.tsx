import { FomodGroupPanel } from "../FomodGroupPanel";
import type { FomodStep } from "../../../../types/fomod.types";
import "./FomodStepPanel.scss";

interface FomodStepPanelProps {
  step: FomodStep;
  stepIndex: number;
  onTogglePlugin: (stepIndex: number, groupIndex: number, pluginIndex: number) => void;
}

export function FomodStepPanel({ step, stepIndex, onTogglePlugin }: FomodStepPanelProps) {
  return (
    <div className="fomod-step-panel">
      <h4 className="fomod-step-panel__title">{step.name}</h4>
      {step.groups?.map((group, gi) => (
        <FomodGroupPanel
          key={`${gi}-${group.name}`}
          group={group}
          stepIndex={stepIndex}
          groupIndex={gi}
          onTogglePlugin={onTogglePlugin}
        />
      ))}
    </div>
  );
}
