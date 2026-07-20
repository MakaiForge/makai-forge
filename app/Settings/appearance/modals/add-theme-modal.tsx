import { Modal } from "@renderer/components/modal/modal";
import { TextField } from "@renderer/components/text-field/text-field";
import { Button } from "@renderer/components/button/button";
import { useTranslation } from "react-i18next";
import { useUserDetails, useToast } from "@renderer/hooks";
import { Theme } from "@types";
import { useForm } from "react-hook-form";

import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useCallback, useState, useRef } from "react";
import { generateUUID } from "@renderer/helpers";
import { storeService } from "@renderer/services/store.service";
import { ThemeImporter } from "@renderer/theme/ThemeImporter";

import "./modals.scss";

interface AddThemeModalProps {
  visible: boolean;
  onClose: () => void;
  onThemeAdded: () => void;
}

interface FormValues {
  name: string;
}

const DEFAULT_THEME_CODE = `/*
  Here you can edit CSS for your theme and apply it on Makai Forge.
  There are a few classes already in place, you can use them to style the launcher.

  If you want to learn more about how to run Makai Forge in dev mode (which will allow you to inspect the DOM and view the classes)
  or how to publish your theme in the theme store, you can check the docs:
  https://makaiforger.app/docs/themes.html

  Happy hacking!
*/

/* Header */
.header {}

/* Sidebar */
.sidebar {}

/* Main content */
.container__content {}

/* Bottom panel */
.bottom-panel {}

/* Toast */
.toast {}

/* Button */
.button {}
`;

export function AddThemeModal({
  visible,
  onClose,
  onThemeAdded,
}: Readonly<AddThemeModalProps>) {
  const { t } = useTranslation("settings");
  const { userDetails } = useUserDetails();
  const { showSuccessToast, showErrorToast } = useToast();
  const [importedCss, setImportedCss] = useState<string | null>(null);
  const [cssText, setCssText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const schema = yup.object({
    name: yup
      .string()
      .required(t("required_field"))
      .min(3, t("name_min_length")),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
  });

  const [importedVars, setImportedVars] = useState<Record<
    string,
    string
  > | null>(null);
  const [importedBg, setImportedBg] = useState<Theme['background']>(null);
  const [importedSoundFileName, setImportedSoundFileName] = useState<string | null | undefined>(null);
  const importedFileRef = useRef<File | null>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      importedFileRef.current = file;
      try {
        const theme = await ThemeImporter.importFromFile(file);
        setValue("name", theme.name);
        setImportedVars(theme.vars || null);
        setImportedCss(theme.code);
        setCssText(theme.code);
        setImportedBg(theme.background ?? null);
        setImportedSoundFileName(theme.soundFileName ?? null);
        console.log('[ThemeImport] loaded:', theme.name, 'vars:', Object.keys(theme.vars || {}).length, 'bg:', theme.background?.type || 'none', 'sound:', theme.soundFileName || 'none');
        showSuccessToast(t("makaitheme_loaded"));
      } catch (err) {
        console.error('[ThemeImport] failed:', err);
        showErrorToast(t("invalid_makaitheme_file"));
      } finally {
        setImporting(false);
      }
    },
    [setValue, showSuccessToast, showErrorToast, t]
  );

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const code = importedCss || cssText || DEFAULT_THEME_CODE;
      const theme: Theme = {
        id: generateUUID(),
        name: values.name,
        isActive: false,
        author: userDetails?.id,
        authorName: userDetails?.username,
        code,
        vars: importedVars || undefined,
        background: importedBg,
        soundFileName: importedSoundFileName,
        hasCustomSound: !!importedSoundFileName,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log('[ThemeCreate] saving theme:', theme.name, 'vars:', Object.keys(theme.vars || {}).length, 'bg:', theme.background?.type || 'none');
      await storeService.put(theme.id, theme, "themes");

      if (importedFileRef.current) {
        console.log('[ThemeCreate] extracting assets from file:', importedFileRef.current.name);
        const buffer = await importedFileRef.current.arrayBuffer();
        await window.electron.extractThemeAssets(buffer, theme).catch((err) => {
          console.warn('[ThemeCreate] asset extraction failed:', err);
        });
      }

      await window.electron.toggleCustomTheme(theme.id, true);

      onThemeAdded();
      onClose();
      importedFileRef.current = null;
      reset();
      setImportedCss(null);
      setCssText("");
      setImportedVars(null);
      setImportedBg(null);
      setImportedSoundFileName(null);
    },
    [
      onClose,
      onThemeAdded,
      userDetails?.id,
      userDetails?.username,
      reset,
      importedCss,
      cssText,
      importedVars,
      importedBg,
      importedSoundFileName,
    ]
  );

  return (
    <Modal
      visible={visible}
      title={t("create_theme_modal_title")}
      description={t("create_theme_modal_description")}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="add-theme-modal__container"
      >
        <TextField
          {...register("name")}
          label={t("theme_name")}
          placeholder={t("insert_theme_name")}
          hint={errors.name?.message}
          error={errors.name?.message}
        />

        <div className="add-theme-modal__import-section">
          <input
            ref={fileInputRef}
            type="file"
            accept=".makaitheme,.json"
            onChange={handleFileSelect}
            className="add-theme-modal__file-input"
          />
          <Button
            type="button"
            theme="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? t("importing") : t("import_makaitheme_file")}
          </Button>
        </div>

        <div className="add-theme-modal__css-section">
          <label className="add-theme-modal__css-label">
            {t("theme_css")}
            <textarea
              className="add-theme-modal__css-textarea"
              rows={10}
              placeholder={t("theme_css_placeholder")}
              value={cssText}
              onChange={(e) => {
                setCssText(e.target.value);
                setImportedCss(null);
              }}
            />
          </label>
        </div>

        <Button type="submit" theme="primary" disabled={isSubmitting || importing}>
          {t("create_theme")}
        </Button>
      </form>
    </Modal>
  );
}
