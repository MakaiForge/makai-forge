import "./progress.scss";

interface BackupProgressBarProps {
  percent: number;
  status: string;
}

export function BackupProgressBar({ percent, status }: BackupProgressBarProps) {
  return (
    <div className="backup-progress">
      <div className="backup-progress__bar-container">
        <div
          className="backup-progress__bar"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="backup-progress__percent">{percent}%</span>
      <span className="backup-progress__status">{status}</span>
    </div>
  );
}
