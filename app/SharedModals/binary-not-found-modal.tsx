import { useTranslation } from "react-i18next";

import { Modal } from "@renderer/components";

interface BinaryNotFoundModalProps {
  visible: boolean;
  onClose: () => void;
  onBrowse?: () => void;
}

export function BinaryNotFoundModal({
  visible,
  onClose,
  onBrowse,
}: BinaryNotFoundModalProps) {
  const { t } = useTranslation("binary_not_found_modal");

  return (
    <Modal
      visible={visible}
      title={t("title")}
      description={t("description")}
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <p style={{ margin: 0 }}>{t("instructions")}</p>
        {onBrowse && (
          <button
            onClick={onBrowse}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid var(--accent-color, #0078d4)",
              borderRadius: "6px",
              background: "transparent",
              color: "var(--accent-color, #0078d4)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Procurar executável manualmente...
          </button>
        )}
      </div>
    </Modal>
  );
}
