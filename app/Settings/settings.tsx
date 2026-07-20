import { useTranslation } from "react-i18next";
import {
  SettingsContextConsumer,
  SettingsContextProvider,
} from "@renderer/context";
import { useMemo } from "react";
import "./settings.scss";
import {
  GearIcon,
  PersonIcon,
  ToolsIcon,
  PlayIcon,
  AppsIcon,
} from "@primer/octicons-react";
import { SettingsContextGeneral } from "./settings-context-general";
import { SettingsContextLogin } from "./settings-context-login";
import { SettingsContextAccountSettings } from "./settings-context-account-settings";
import { SettingsContextContentGameplay } from "./settings-context-content-gameplay";
import { SettingsContextRunners } from "./settings-context-runners";

export default function Settings() {
  const { t } = useTranslation("settings");

  const categories = useMemo(
    () => [
      {
        id: "general" as const,
        label: t("general"),
        icon: <GearIcon size={16} />,
      },
      {
        id: "login" as const,
        label: "Login",
        icon: <PersonIcon size={16} />,
      },
      {
        id: "account_settings" as const,
        label: "Configurações da Conta",
        icon: <ToolsIcon size={16} />,
      },
      {
        id: "content_gameplay" as const,
        label: t("content_gameplay"),
        icon: <PlayIcon size={16} />,
      },
      {
        id: "runners" as const,
        label: "Executores",
        icon: <AppsIcon size={16} />,
      },
    ],
    [t]
  );

  return (
    <SettingsContextProvider>
      <SettingsContextConsumer>
        {({ currentCategoryId, setCurrentCategoryId, appearance }) => {
          const currentCategory =
            categories.find((category) => category.id === currentCategoryId) ??
            categories[0];
          const selectedCategoryId = currentCategory.id;

          const renderCategory = () => {
            if (selectedCategoryId === "general") {
              return <SettingsContextGeneral appearance={appearance} />;
            }

            if (selectedCategoryId === "login") {
              return <SettingsContextLogin />;
            }

            if (selectedCategoryId === "account_settings") {
              return <SettingsContextAccountSettings />;
            }

            if (selectedCategoryId === "content_gameplay") {
              return <SettingsContextContentGameplay />;
            }

            if (selectedCategoryId === "runners") {
              return <SettingsContextRunners />;
            }

            return null;
          };

          return (
            <section className="settings__container">
              <div className="settings__content">
                <aside className="settings__sidebar">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`settings__sidebar-button ${
                        currentCategory.id === category.id
                          ? "settings__sidebar-button--active"
                          : ""
                      }`}
                      onClick={() => setCurrentCategoryId(category.id)}
                    >
                      <span className="settings__sidebar-button-icon">
                        {category.icon}
                      </span>
                      <span>{category.label}</span>
                    </button>
                  ))}
                </aside>

                <div className="settings__panel">
                  <h2>{currentCategory.label}</h2>
                  {renderCategory()}
                </div>
              </div>
            </section>
          );
        }}
      </SettingsContextConsumer>
    </SettingsContextProvider>
  );
}
