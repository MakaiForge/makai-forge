import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";

import "./settings-general.scss";

export function SettingsContextAccountSettings() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [form, setForm] = useState({
    downloadNotificationsEnabled: false,
    repackUpdatesNotificationsEnabled: false,
    achievementNotificationsEnabled: true,
  });

  useEffect(() => {
    if (!userPreferences) return;

    setForm((prev) => ({
      ...prev,
      downloadNotificationsEnabled:
        userPreferences.downloadNotificationsEnabled ?? false,
      repackUpdatesNotificationsEnabled:
        userPreferences.repackUpdatesNotificationsEnabled ?? false,
      achievementNotificationsEnabled:
        userPreferences.achievementNotificationsEnabled ?? true,
    }));
  }, [userPreferences]);

  const handleChange = async (values: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...values }));
    await updateUserPreferences(values);
  };

  const [auth, setAuth] = useState<{ user: { username: string; id: number; role?: string; is_admin?: boolean } } | null>(null);

  useEffect(() => {
    window.electron.getMakaiAuth().then(setAuth);
  }, []);

  if (!auth) {
    return (
      <div className="settings-context-panel">
        <div className="settings-context-panel__group">
          <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
            Faça login na aba "Login" para acessar as configurações da conta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>Notificações</h3>
        <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "1rem" }}>
          Escolha quais notificações você quer receber no aplicativo.
        </p>

        <CheckboxField
          label="Alguém deu like no meu comentário"
          checked={form.downloadNotificationsEnabled}
          onChange={() =>
            handleChange({
              downloadNotificationsEnabled: !form.downloadNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label="Alguém respondeu meu comentário"
          checked={form.repackUpdatesNotificationsEnabled}
          onChange={() =>
            handleChange({
              repackUpdatesNotificationsEnabled:
                !form.repackUpdatesNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label="Recebi uma conquista / subi de nível"
          checked={form.achievementNotificationsEnabled}
          onChange={() =>
            handleChange({
              achievementNotificationsEnabled:
                !form.achievementNotificationsEnabled,
            })
          }
        />
      </div>

    </div>
  );
}
