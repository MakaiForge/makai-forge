import { useState } from "react";
import type { DeployResult, DeployAction } from "../../../types/mod.types";

import "./DeployConfirmModal.scss";

interface DeployConfirmModalProps {
  open: boolean;
  deployActions?: DeployAction[];
  deployResult?: DeployResult | null;
  isDeploying: boolean;
  gamePath?: string;
  gameId?: string;
  onConfirm: (backup: boolean, bsaInvalidate?: boolean) => void;
  onClose: () => void;
}

export function DeployConfirmModal({
  open, deployActions, deployResult, isDeploying, gamePath, gameId, onConfirm, onClose,
}: DeployConfirmModalProps) {
  const [backup, setBackup] = useState(true);
  const [bsa, setBsa] = useState(false);
  if (!open) return null;

  return (
    <div className="deploy-confirm-modal__overlay" onClick={onClose}>
      <div className="deploy-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="deploy-confirm-modal__header">
          <h3>{isDeploying ? "Deploying..." : deployResult ? "Deploy Complete" : "Confirm Deploy"}</h3>
          <button className="deploy-confirm-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="deploy-confirm-modal__body">
          {isDeploying && <p className="deploy-confirm-modal__progress">Copying files, please wait...</p>}

          {deployResult && (
            <div className="deploy-confirm-modal__result">
              <p>Deploy finished.</p>
              {deployResult.conflicts && deployResult.conflicts.length > 0 && (
                <p className="deploy-confirm-modal__warn">{deployResult.conflicts.length} conflict(s) found.</p>
              )}
            </div>
          )}

          {!isDeploying && !deployResult && (
            <>
              <p>This will copy enabled mod files to the game's data folder.</p>
              {deployActions && deployActions.length > 0 && (
                <ul className="deploy-confirm-modal__actions">
                  {deployActions.map((a, i) => (
                    <li key={i}>{a.action === "copy" ? "+" : "×"} {a.file}</li>
                  ))}
                </ul>
              )}
              <label className="deploy-confirm-modal__backup">
                <input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)} />
                Create backup before deploying
              </label>
              <label className="deploy-confirm-modal__bsa">
                <input type="checkbox" checked={bsa} onChange={e => setBsa(e.target.checked)} />
                Enable BSA Invalidation
              </label>
            </>
          )}
        </div>
        <div className="deploy-confirm-modal__footer">
          <button onClick={onClose}>{deployResult ? "Close" : "Cancel"}</button>
          {!isDeploying && !deployResult && (
            <button onClick={() => onConfirm(backup, bsa)}>Deploy</button>
          )}
        </div>
      </div>
    </div>
  );
}
