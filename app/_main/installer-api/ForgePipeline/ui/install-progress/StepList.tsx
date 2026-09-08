interface StepListProps {
  steps: string[];
  currentStepIdx: number;
  isComplete: boolean;
  isError: boolean;
  stepLabel: (key: string) => string;
}

export function StepList({
  steps,
  currentStepIdx,
  isComplete,
  isError,
  stepLabel,
}: StepListProps) {
  const getStepStatus = (idx: number) => {
    if (idx < currentStepIdx) return "completed";
    if (idx === currentStepIdx) {
      if (isComplete) return "completed";
      if (isError) return "error";
      return "active";
    }
    return "pending";
  };

  return (
    <ul className="install-progress-modal__steps">
      {steps.map((key, idx) => {
        const status = getStepStatus(idx);
        return (
          <li
            key={key}
            className={`install-progress-modal__step install-progress-modal__step--${status}`}
          >
            <span className="install-progress-modal__step-icon">
              {status === "completed" && "✓"}
              {status === "active" && "⟳"}
              {status === "pending" && "○"}
              {status === "error" && "✕"}
            </span>
            <span className="install-progress-modal__step-label">
              {stepLabel(key)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
