import { useTranslation } from "react-i18next";
import { Modal } from "@components";

import "./scanning-prefix-modal.scss";

interface ScanningPrefixModalProps {
  visible: boolean;
}

export function ScanningPrefixModal({
  visible,
}: Readonly<ScanningPrefixModalProps>) {
  const { t } = useTranslation("downloads");

  return (
    <Modal visible={visible} title={t("scanning_title")} onClose={() => {}}>
      <div className="scanning-prefix-modal">
        <div className="scanning-prefix-modal__spinner" />
        <p className="scanning-prefix-modal__text">
          {t("scanning_description")}
        </p>
      </div>
    </Modal>
  );
}
