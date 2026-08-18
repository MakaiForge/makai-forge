import { useCallback, useEffect, useState } from "react";
import "./theme-editor.scss";
import Editor from "@monaco-editor/react";
import { Theme } from "@types";
import { useSearchParams } from "react-router-dom";
import { Button } from "@components";
import { CheckIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { storeService } from "@shared-services/store.service";
import { logger } from "@shared-logger";

/** Padrões CSS perigosos que podem quebrar o app ou executar código */
const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/i,
  /javascript\s*:/i,
  /@import\s+[^;]*(?!url).*$/m,
  /behavior\s*:/i,
  /-moz-binding\s*:/i,
  /url\s*\(\s*['"]?\s*data\s*:/i,
];

function validateCss(css: string): string[] {
  const warnings: string[] = [];
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(css)) {
      warnings.push(`Padrão potencialmente perigoso detectado: ${pattern.source}`);
    }
  }
  if (css.length > 100_000) {
    warnings.push(`CSS muito longo (${(css.length / 1024).toFixed(0)}KB) — pode causar lentidão`);
  }
  return warnings;
}

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

  const [cssWarnings, setCssWarnings] = useState<string[]>([]);

  const handleSave = useCallback(async () => {
    if (!theme) return;
    const warnings = validateCss(code);
    if (warnings.length > 0) {
      setCssWarnings(warnings);
      logger.warn("[ThemeEditor] CSS warnings:", warnings);
      // Ainda permite salvar, mas loga os warnings
    }
    await window.electron.updateCustomTheme(theme.id, code);
    setHasUnsavedChanges(false);
    setCssWarnings([]);
  }, [code, theme]);

  // Validar CSS enquanto digita (debounce via useEffect)
  useEffect(() => {
    if (!code) { setCssWarnings([]); return; }
    const timer = setTimeout(() => {
      const warnings = validateCss(code);
      setCssWarnings(warnings);
    }, 1000);
    return () => clearTimeout(timer);
  }, [code]);

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
        {cssWarnings.length > 0 && (
          <div className="theme-editor__warnings">
            {cssWarnings.map((w, i) => (
              <span key={i} className="theme-editor__warning">⚠️ {w}</span>
            ))}
          </div>
        )}
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
