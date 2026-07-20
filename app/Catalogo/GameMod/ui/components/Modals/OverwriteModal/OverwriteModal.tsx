import { useTranslation } from "react-i18next";
import { Modal, Button } from "@renderer/components";
import "./OverwriteModal.scss";

interface OverwriteModalProps {
  open: boolean;
  modName: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

export function OverwriteModal({ open, modName, onConfirm, onCancel }: OverwriteModalProps) {
  const { t } = useTranslation("mod_manager");
  return (
    <Modal visible={open} title={t("overwrite_title")} onClose={onCancel}>
      <div className="mod-manager__overwrite-modal">
        <p>{t("overwrite_desc", { name: modName })}</p>
        <div className="mod-manager__overwrite-actions">
          <Button theme="primary" onClick={onConfirm}>{t("overwrite_confirm")}</Button>
          <Button onClick={onCancel}>{t("cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}
