import { Button, Modal } from "@renderer/components";
import { useTranslation } from "react-i18next";
import "./protonforge-cloud-modal.scss";

export interface ProtonForgeCloudModalProps {
  feature: string;
  visible: boolean;
  onClose: () => void;
}

export const ProtonForgeCloudModal = ({
  feature,
  visible,
  onClose,
}: ProtonForgeCloudModalProps) => {
  const { t } = useTranslation("protonfroger_cloud");

  const handleClickOpenCheckout = () => {
    window.electron.openCheckout();
  };

  return (
    <Modal visible={visible} title={t("protonfroger_cloud")} onClose={onClose}>
      <div
        className="protonforge-cloud-modal__container"
        data-protonforge-cloud-feature={feature}
      >
        {t("protonfroger_cloud_feature_found")}
        <Button onClick={handleClickOpenCheckout}>{t("learn_more")}</Button>
      </div>
    </Modal>
  );
};
