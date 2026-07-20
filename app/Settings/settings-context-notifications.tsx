import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";

import "./settings-general.scss";

export function SettingsContextNotifications() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [form, setForm] = useState({
    downloadNotificationsEnabled: false,
    repackUpdatesNotificationsEnabled: false,
  });

  useEffect(() => {
    if (!userPreferences) return;

    setForm((prev) => ({
      ...prev,
      downloadNotificationsEnabled:
        userPreferences.downloadNotificationsEnabled ?? false,
      repackUpdatesNotificationsEnabled:
        userPreferences.repackUpdatesNotificationsEnabled ?? false,
    }));
  }, [userPreferences]);

  const handleChange = async (values: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...values }));
    await updateUserPreferences(values);
  };

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("library_notifications")}</h3>

        <CheckboxField
          label={t("enable_download_notifications")}
          checked={form.downloadNotificationsEnabled}
          onChange={() =>
            handleChange({
              downloadNotificationsEnabled: !form.downloadNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_repack_list_notifications")}
          checked={form.repackUpdatesNotificationsEnabled}
          onChange={() =>
            handleChange({
              repackUpdatesNotificationsEnabled:
                !form.repackUpdatesNotificationsEnabled,
            })
          }
        />
      </div>
    </div>
  );
}
