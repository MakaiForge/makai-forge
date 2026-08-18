import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "@components";
import { settingsContext } from "@context";
import { useAppSelector } from "@hooks";

import "./settings-general.scss";

export function SettingsContextAccountSettings() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [form, setForm] = useState({
    likeNotificationsEnabled: false,
    replyNotificationsEnabled: false,
    achievementNotificationsEnabled: true,
  });

  useEffect(() => {
    if (!userPreferences) return;

    setForm((prev) => ({
      ...prev,
      likeNotificationsEnabled:
        (userPreferences as any).likeNotificationsEnabled ?? false,
      replyNotificationsEnabled:
        (userPreferences as any).replyNotificationsEnabled ?? false,
      achievementNotificationsEnabled:
        (userPreferences as any).achievementNotificationsEnabled ?? true,
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
          checked={form.likeNotificationsEnabled}
          onChange={() =>
            handleChange({
              likeNotificationsEnabled: !form.likeNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label="Alguém respondeu meu comentário"
          checked={form.replyNotificationsEnabled}
          onChange={() =>
            handleChange({
              replyNotificationsEnabled:
                !form.replyNotificationsEnabled,
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
