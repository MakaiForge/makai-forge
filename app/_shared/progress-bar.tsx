import "./progress-bar.scss";

interface ProgressBarProps {
  value: number;
  max?: number;
}

export function ProgressBar({ value, max = 100 }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="progress-bar">
      <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
