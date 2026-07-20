import { useTranslation } from "react-i18next";
import "./profile-content.scss";

export function ProfileTabs() {
  const { t } = useTranslation("user_profile");

  return (
    <div className="profile-content__tabs">
      <div className="profile-content__tab-wrapper">
        <span className="profile-content__tab profile-content__tab--active">
          {t("library")}
        </span>
      </div>
    </div>
  );
}
