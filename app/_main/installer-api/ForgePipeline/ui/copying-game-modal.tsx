import { useTranslation } from "react-i18next";
import { Modal } from "@components";

import "./copying-game-modal.scss";

interface CopyingGameModalProps {
  visible: boolean;
}

export function CopyingGameModal({
  visible,
}: Readonly<CopyingGameModalProps>) {
  const { t } = useTranslation("downloads");

  return (
    <Modal visible={visible} title={t("copying_title")} onClose={() => {}}>
      <div className="copying-game-modal">
        <div className="copying-game-modal__spinner" />
        <p className="copying-game-modal__text">
          {t("copying_description")}
        </p>
      </div>
    </Modal>
  );
}
