import { useCallback, useEffect, useState } from "react";
import "./theme-editor.scss";
import Editor from "@monaco-editor/react";
import { Theme } from "@types";
import { useSearchParams } from "react-router-dom";
import { Button } from "@renderer/components";
import { CheckIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { storeService } from "@renderer/services/store.service";

export default function ThemeEditor() {
  const [searchParams] = useSearchParams();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [code, setCode] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const themeId = searchParams.get("themeId");

  const { t } = useTranslation("settings");

  useEffect(() => {
    window.document.title = "Makai Forge - Theme Editor";
  }, []);

  useEffect(() => {
    if (themeId) {
      storeService.get(themeId, "themes").then((loadedTheme) => {
        const theme = loadedTheme as Theme | null;
        if (theme) {
          setTheme(theme);
          setCode(theme.code);
        }
      });
    }
  }, [themeId]);

  const handleSave = useCallback(async () => {
    if (theme) {
      await window.electron.updateCustomTheme(theme.id, code);
      setHasUnsavedChanges(false);
    }
  }, [code, theme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [code, handleSave, theme]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      setHasUnsavedChanges(true);
    }
  };

  return (
    <div className="theme-editor">
      <div className="theme-editor__header">
        <h1>{theme?.name}</h1>
        {hasUnsavedChanges && (
          <div className="theme-editor__header__status"></div>
        )}
      </div>

      <div className="theme-editor__editor">
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <Editor
            theme="vs-dark"
            defaultLanguage="css"
            value={code}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        </div>
      </div>

      <div className="theme-editor__footer">
        <div className="theme-editor__footer-actions">
          <Button onClick={handleSave}>
            <CheckIcon />
            {t("editor_tab_save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
