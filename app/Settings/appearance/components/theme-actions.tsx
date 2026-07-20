import { GlobeIcon, FileIcon } from "@primer/octicons-react";
import { Button } from "@renderer/components/button/button";
import { useTranslation } from "react-i18next";
import { useToast, useUserDetails } from "@renderer/hooks";
import "./theme-actions.scss";
import { useRef, useCallback } from "react";
import { THEME_WEB_STORE_URL } from "@renderer/constants";
import { generateUUID, injectCustomCss, removeCustomCss } from "@renderer/helpers";
import { storeService } from "@renderer/services/store.service";
import type { Theme } from "@types";

interface ThemeActionsProps {
  onListUpdated: () => void;
  themesCount: number;
}

export const ThemeActions = ({
  onListUpdated,
  themesCount,
}: ThemeActionsProps) => {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const { userDetails } = useUserDetails();
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.makaitheme')) {
        try {
          const buffer = await file.arrayBuffer();
          const theme = await window.electron.importMakaiTheme(buffer);
          if (theme) {
            const allThemes = (await storeService.values('themes')) as { id: string; isActive?: boolean }[];
            const activeTheme = allThemes.find((t) => t.isActive);
            if (activeTheme) {
              removeCustomCss();
              await window.electron.toggleCustomTheme(activeTheme.id, false);
            }
            await window.electron.toggleCustomTheme(theme.id, true);
            onListUpdated();
            showSuccessToast(t('theme_imported'));
          }
        } catch {
          showErrorToast(t('error_importing_theme'));
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (
            data.format !== "makaitheme" &&
            !data.vars &&
            !data.css
          ) {
            showErrorToast(t("invalid_makaitheme_file"));
            return;
          }

          let code = data.css || "";
          if (!code && data.vars) {
            code =
              ":root {\n" +
              Object.entries(data.vars)
                .map(([k, v]) => `  ${k}: ${v};`)
                .join("\n") +
              "\n}\n";
          }

          const theme: Theme = {
            id: generateUUID(),
            name: data.name || file.name.replace(/\.(makaitheme|json)$/i, ""),
            isActive: false,
            author: userDetails?.id,
            authorName: userDetails?.username,
            code,
            vars: data.vars || undefined,
            hasCustomSound: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await storeService.put(theme.id, theme, "themes");

          const allThemes = (await storeService.values("themes")) as {
            id: string;
            isActive?: boolean;
          }[];
          const activeTheme = allThemes.find((t) => t.isActive);

          if (activeTheme) {
            removeCustomCss();
            await window.electron.toggleCustomTheme(activeTheme.id, false);
          }

          if (theme.code) {
            injectCustomCss(theme.code);
          }

          await window.electron.toggleCustomTheme(theme.id, true);

          onListUpdated();
          showSuccessToast(t("theme_imported"));
        } catch (err) {
          showErrorToast(t("error_importing_theme"));
        }
      };
      reader.readAsText(file);
    },
    [onListUpdated, showSuccessToast, showErrorToast, userDetails, t]
  );

  return (
    <>
      <input
        ref={importFileRef}
        type="file"
        accept=".makaitheme,.json"
        onChange={handleImportFile}
        style={{ display: "none" }}
      />

      <div className="settings-appearance__actions">
        <Button
          theme="outline"
          className="settings-appearance__button settings-appearance__button--black"
          onClick={() => window.open(THEME_WEB_STORE_URL, "_blank")}
        >
          <GlobeIcon />
          {t("create_theme")}
        </Button>

        <Button
          theme="outline"
          className="settings-appearance__button settings-appearance__button--black"
          onClick={() => importFileRef.current?.click()}
        >
          <FileIcon />
          {t("import_theme")}
        </Button>
      </div>
    </>
  );
};