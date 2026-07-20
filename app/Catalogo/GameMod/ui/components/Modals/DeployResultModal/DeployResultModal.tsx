import { Modal } from "@renderer/components";
import type { DeploymentResult } from "@types";
import "./DeployResultModal.scss";

interface DeployResultModalProps {
  open: boolean;
  result: DeploymentResult | null;
  onClose: () => void;
}

export function DeployResultModal({ open, result, onClose }: DeployResultModalProps) {
  return (
    <Modal
      visible={open}
      title={result?.success ? "Deploy Successful" : "Deploy Failed"}
      onClose={onClose}
    >
      <div className="mod-manager__deploy-log">
        {result?.log.map((line, i) => <p key={i}>{line}</p>)}
      </div>
    </Modal>
  );
}
