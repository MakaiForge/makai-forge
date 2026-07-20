import { useTranslation } from "react-i18next";
import { useContext, useState, useEffect } from "react";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import { SettingsDebrid } from "./settings-debrid";
import { TextField } from "@renderer/components";

export function SettingsContextIntegrations() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const userPreferences = useAppSelector((state) => state.userPreferences.value);

  const [ggDealsKey, setGgDealsKey] = useState("");

  useEffect(() => {
    setGgDealsKey(userPreferences?.ggDealsApiKey || "");
  }, [userPreferences?.ggDealsApiKey]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGgDealsKey(value);
    updateUserPreferences({ ggDealsApiKey: value || null });
  };

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("gg_deals")}</h3>
        <p className="settings-context-panel__description">
          {t("gg_deals_description")}
        </p>
        <TextField
          label={t("gg_deals_api_key")}
          value={ggDealsKey}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          onChange={handleKeyChange}
        />
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("debrid_services")}</h3>
        <SettingsDebrid />
      </div>
    </div>
  );
}
