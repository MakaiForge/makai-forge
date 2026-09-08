import { Button } from "@components";
import { getTierColor, getTierBg } from "../helpers";
import type { DownloadProgress, SwitchResult } from "../types";
import type { ProtonFork } from "@types";

interface SelectedSummaryProps {
  mode: "install" | "switch";
  selectedFork: ProtonFork | null;
  selectedProton: string | null;
  selectedVersion: string;
  selectedDisplayName: string | null;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
  switching: boolean;
  switchResult: SwitchResult | null;
  onConfirm: () => void;
  onClear: () => void;
}

export function SelectedSummary({
  mode,
  selectedFork,
  selectedProton,
  selectedVersion,
  selectedDisplayName,
  isDownloading,
  downloadProgress,
  switching,
  switchResult,
  onConfirm,
  onClear,
}: SelectedSummaryProps) {
  return (
    <div className="prm__selected">
      <div className="prm__selected-header">
        <div className="prm__selected-info">
          <span className="prm__selected-name">
            {selectedFork?.name ||
              (selectedProton ? selectedDisplayName : "") ||
              selectedVersion}
          </span>
          <span className="prm__selected-version">{selectedVersion}</span>
          {selectedFork && (
            <span
              className="prm__selected-tier"
              style={{
                borderColor: getTierColor(selectedFork.tier),
                backgroundColor: getTierBg(selectedFork.tier),
                color: getTierColor(selectedFork.tier),
              }}
            >
              {selectedFork.tier}
            </span>
          )}
        </div>
        {selectedFork && (
          <div className="prm__selected-score">
            <span>Score</span>
            <span
              className="prm__selected-score-value"
              style={{ color: getTierColor(selectedFork.tier) }}
            >
              {selectedFork.tierScore}
            </span>
          </div>
        )}
      </div>
      {isDownloading && downloadProgress && (
        <div className="prm__selected-progress">
          <div className="prm__progress-bar">
            <div
              className="prm__progress-fill"
              style={{ width: `${Math.max(2, downloadProgress.percent)}%` }}
            />
          </div>
          <span className="prm__progress-text">
            {downloadProgress.status || "Baixando..."} ({downloadProgress.percent}%)
          </span>
        </div>
      )}
      <div className="prm__selected-actions">
        <Button
          theme="primary"
          onClick={onConfirm}
          disabled={isDownloading || switching}
        >
          {switching
            ? "Trocando Proton..."
            : isDownloading
              ? "Baixando..."
              : mode === "switch"
                ? `Trocar para ${selectedDisplayName || selectedVersion}`
                : selectedProton
                  ? `Instalar com ${selectedDisplayName || selectedVersion}`
                  : `Baixar e Instalar ${selectedDisplayName || selectedVersion}`}
        </Button>
        <Button onClick={onClear}>Limpar</Button>
      </div>
      {switchResult && (
        <div
          className={`prm__switch-result ${switchResult.ok ? "--ok" : "--fail"}`}
        >
          {switchResult.ok ? "✅ " : "❌ "}
          {switchResult.msg}
        </div>
      )}
    </div>
  );
}
