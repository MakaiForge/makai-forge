import { useId } from "react";
import type { ProtonVersion } from "@types";
import { Tooltip } from "react-tooltip";
import { RadioField } from "@renderer/components/radio-field/radio-field";
import "./proton-path-picker.scss";

export interface ProtonPathPickerProps {
  versions: ProtonVersion[];
  selectedPath: string;
  onChange: (value: string) => void;
  radioName: string;
  autoLabel: string;
  autoSourceDescription: string;
  steamSourceDescription: string;
  compatibilityToolsSourceDescription: string;
}

const getProtonSourceDescription = (
  source: ProtonVersion["source"],
  versionPath: string,
  steamSourceDescription: string,
  compatibilityToolsSourceDescription: string
) => {
  if (source === "fork_catalog") {
    return "Disponível no catálogo. Instale para usar.";
  }
  if (
    source === "compatibility_tools" ||
    versionPath.includes("compatibilitytools.d")
  ) {
    return compatibilityToolsSourceDescription;
  }
  return steamSourceDescription;
};

export function ProtonPathPicker({
  versions,
  selectedPath,
  onChange,
  radioName,
  autoLabel,
  autoSourceDescription,
  steamSourceDescription,
  compatibilityToolsSourceDescription,
}: Readonly<ProtonPathPickerProps>) {
  const protonTooltipId = useId();

  const installed = versions.filter((v) => v.isInstalled);
  const available = versions.filter((v) => !v.isInstalled);

  return (
    <div className="proton-path-picker">
      <RadioField
        name={radioName}
        value=""
        checked={selectedPath === ""}
        onChange={(event) => onChange(event.target.value)}
        className="proton-path-picker__option"
        labelClassName="proton-path-picker__option-label"
        label={
          <span
            data-tooltip-id={protonTooltipId}
            data-tooltip-content={autoSourceDescription}
          >
            {autoLabel}
          </span>
        }
        aria-label={autoLabel}
      />

      {installed.length > 0 && (
        <>
          <div className="proton-path-picker__group-label">Instalados</div>
          {installed.map((version) => (
            <RadioField
              key={version.path}
              name={radioName}
              value={version.path}
              checked={selectedPath === version.path}
              onChange={(event) => onChange(event.target.value)}
              className="proton-path-picker__option"
              labelClassName="proton-path-picker__option-label"
              label={
                <span
                  data-tooltip-id={protonTooltipId}
                  data-tooltip-content={getProtonSourceDescription(
                    version.source,
                    version.path,
                    steamSourceDescription,
                    compatibilityToolsSourceDescription
                  )}
                >
                  {version.name}
                </span>
              }
              aria-label={version.name}
            />
          ))}
        </>
      )}

      {available.length > 0 && (
        <>
          <div className="proton-path-picker__group-label proton-path-picker__group-label--available">
            Disponíveis
          </div>
          {available.map((version) => (
            <div
              key={version.path}
              className="proton-path-picker__available-item"
              data-tooltip-id={protonTooltipId}
              data-tooltip-content={`${version.name} — baixe e instale em compatibilitytools.d`}
            >
              <span className="proton-path-picker__available-name">
                {version.name}
              </span>
              {version.tierScore != null && (
                <span className="proton-path-picker__available-score">
                  Score: {version.tierScore}
                </span>
              )}
            </div>
          ))}
        </>
      )}

      <Tooltip id={protonTooltipId} />
    </div>
  );
}
