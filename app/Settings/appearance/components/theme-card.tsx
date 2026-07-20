import { PencilIcon, TrashIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components/button/button";
import type { Theme } from "@types";
import "./theme-card.scss";
import { useEffect, useState } from "react";
import { DeleteThemeModal } from "../modals/delete-theme-modal";
import { injectCustomCss, removeCustomCss } from "@renderer/helpers";
import { useToast } from "@renderer/hooks";

interface ThemeCardProps {
  theme: Theme;
  onListUpdated: () => void;
}

export const ThemeCard = ({ theme, onListUpdated }: ThemeCardProps) => {
  const { t } = useTranslation("settings");
  const { showSuccessToast } = useToast();

  const [deleteThemeModalVisible, setDeleteThemeModalVisible] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(theme.isActive);

  useEffect(() => {
    setIsActive(theme.isActive);
  }, [theme.isActive]);

  const hasBackground = theme.background && theme.background.type !== 'none';

  useEffect(() => {
    if (!hasBackground) return;

    let cancelled = false;

    const loadBg = async () => {
      const path = await window.electron.getThemeAssetPath(theme.id, 'background');
      if (cancelled) return;
      if (path) {
        setBackgroundUrl(`local:${path}`);
      }
    };

    loadBg();

    return () => { cancelled = true; };
  }, [theme.id, hasBackground]);

  const toggleTheme = async () => {
    try {
      if (isActive) {
        removeCustomCss();
        await window.electron.toggleCustomTheme(theme.id, false);
        setIsActive(false);
        showSuccessToast(t('theme_deactivated', { theme: theme.name }));
      } else {
        const previousActive = await window.electron.getActiveCustomTheme();
        if (previousActive) {
          removeCustomCss();
          await window.electron.toggleCustomTheme(previousActive.id, false);
        }

        if (theme.code) {
          injectCustomCss(theme.code);
        }

        await window.electron.toggleCustomTheme(theme.id, true);
        setIsActive(true);
        showSuccessToast(t('theme_activated', { theme: theme.name }));
      }

      onListUpdated();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <DeleteThemeModal
        visible={deleteThemeModalVisible}
        onClose={() => setDeleteThemeModalVisible(false)}
        onThemeDeleted={onListUpdated}
        themeId={theme.id}
        themeName={theme.name}
        isActive={isActive}
      />

      <div className={`theme-card ${isActive ? "theme-card--active" : ""}`}>
        <button
          className="theme-card__inner"
          onClick={toggleTheme}
          type="button"
        >
          {hasBackground && backgroundUrl && (
            <div className="theme-card__bg">
              <img src={backgroundUrl} alt="" className="theme-card__bg__img" />
            </div>
          )}
          {!hasBackground || !backgroundUrl ? (
            <div className="theme-card__bg theme-card__bg--empty" />
          ) : null}
          <div className="theme-card__name">{theme.name}</div>
        </button>

        <div className="theme-card__actions">
          <Button
            theme="outline"
            className="theme-card__actions__btn settings-appearance__button settings-appearance__button--black"
            onClick={() => window.electron.openEditorWindow(theme.id)}
          >
            <PencilIcon />
            <span className="theme-card__actions__label">{t("edit_theme")}</span>
          </Button>

          <Button
            theme="outline"
            className="theme-card__actions__btn settings-appearance__button settings-appearance__button--black"
            onClick={() => setDeleteThemeModalVisible(true)}
          >
            <TrashIcon />
            <span className="theme-card__actions__label">{t("delete_theme")}</span>
          </Button>
        </div>
      </div>
    </>
  );
};
