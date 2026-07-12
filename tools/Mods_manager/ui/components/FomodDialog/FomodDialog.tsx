import { FomodStepPanel } from "./components/FomodStepPanel";
import type { FomodStep } from "../../types/fomod.types";

import "./FomodDialog.scss";

interface FomodDialogProps {
  open: boolean;
  loading?: boolean;
  steps: FomodStep[];
  currentStep: number;
  installing: boolean;
  error: string | null;
  onTogglePlugin: (stepIndex: number, groupIndex: number, pluginIndex: number) => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  onInstall: () => void;
  onCancel: () => void;
  onResetSelections?: () => void;
}

export function FomodDialog({
  open, loading = false, steps, currentStep, installing, error,
  onTogglePlugin, onNextStep, onPrevStep, onInstall, onCancel, onResetSelections,
}: FomodDialogProps) {
  if (!open) return null;
  if (loading) {
    return (
      <div className="fomod-dialog__overlay">
        <div className="fomod-dialog" onClick={e => e.stopPropagation()}>
          <div className="fomod-dialog__body" style={{ textAlign: "center", padding: "40px 16px" }}>
            <p>Parsing FOMOD installer...</p>
          </div>
        </div>
      </div>
    );
  }

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  if (!step) {
    return (
      <div className="fomod-dialog__overlay" onClick={onCancel}>
        <div className="fomod-dialog" onClick={e => e.stopPropagation()}>
          <div className="fomod-dialog__header">
            <h3>FOMOD Installer</h3>
            <button className="fomod-dialog__close" onClick={onCancel}>×</button>
          </div>
          <div className="fomod-dialog__body" style={{ textAlign: "center", padding: "40px 16px" }}>
            {error ? (
              <p style={{ color: "#e74c3c" }}>{error}</p>
            ) : (
              <>
                <p>No install steps found in this FOMOD.</p>
                <p style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
                  The mod has been installed without configuration.
                </p>
              </>
            )}
          </div>
          <div className="fomod-dialog__footer">
            <button className="fomod-dialog__install" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fomod-dialog__overlay" onClick={onCancel}>
      <div className="fomod-dialog" onClick={e => e.stopPropagation()}>
        <div className="fomod-dialog__header">
          <h3>FOMOD Installer</h3>
          <span className="fomod-dialog__step-indicator">
            Step {currentStep + 1} / {steps.length}
          </span>
          <button className="fomod-dialog__close" onClick={onCancel}>×</button>
        </div>

        {error && <div className="fomod-dialog__error">{error}</div>}

        <div className="fomod-dialog__body">
          <FomodStepPanel
            step={step}
            stepIndex={currentStep}
            onTogglePlugin={onTogglePlugin}
          />
        </div>

        <div className="fomod-dialog__footer">
          {onResetSelections && (
            <button
              className="fomod-dialog__reset"
              disabled={installing}
              onClick={onResetSelections}
              title="Reset to default selections"
            >
              Reset
            </button>
          )}
          <button disabled={isFirst || installing} onClick={onPrevStep}>Back</button>
          <span className="fomod-dialog__footer-info">
            {installing ? "Installing..." : step?.groups?.length ? `${step.groups.length} group(s)` : ""}
          </span>
          {isLast ? (
            <button className="fomod-dialog__install" disabled={installing} onClick={onInstall}>
              {installing ? "Installing..." : "Install"}
            </button>
          ) : (
            <button disabled={installing} onClick={onNextStep}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
