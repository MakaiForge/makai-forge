import { useTranslation } from "react-i18next";
import "./settings-debrid.scss";

export function SettingsDebrid() {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-debrid">
      <p className="settings-debrid__description">{t("debrid_description")}</p>
    </div>
  );
}
