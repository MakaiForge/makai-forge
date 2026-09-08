import { Button } from "@components";

interface ActionsBarProps {
  mode: "install" | "switch";
  selectedProton: string | null;
  selectedDisplayName: string | null;
  selectedVersion: string;
  isDownloading: boolean;
  switching: boolean;
  switchResult: { ok: boolean; msg: string } | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function ActionsBar({
  mode,
  selectedProton,
  selectedDisplayName,
  selectedVersion,
  isDownloading,
  switching,
  switchResult,
  onClose,
  onConfirm,
}: ActionsBarProps) {
  return (
    <div className="proton-recommendation-modal__actions">
      <Button theme="dark" onClick={onClose}>
        {mode === "switch" && switchResult?.ok ? "Fechar" : "Cancelar"}
      </Button>
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
    </div>
  );
}
