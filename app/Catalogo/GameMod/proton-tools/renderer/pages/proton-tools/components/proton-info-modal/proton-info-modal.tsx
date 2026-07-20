import { useState } from "react";
import { Button } from "@renderer/components";
import { t } from "./translations";
import "./proton-info-modal.scss";

const LANGUAGES = [
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "pl", label: "Polski" },
  { code: "nl", label: "Nederlands" },
];

interface ProtonInfoModalProps {
  tool: {
    id: string;
    title: string;
    description: string;
    version?: string;
    body?: string;
    extra?: {
      githubUrl?: string;
      author?: string;
      license?: string;
      features?: string[];
    };
  };
  onClose: () => void;
}

export function ProtonInfoModal({ tool, onClose }: ProtonInfoModalProps) {
  const [translateLang, setTranslateLang] = useState("");
  const [translated, setTranslated] = useState("");
  const [translating, setTranslating] = useState(false);

  const openGitHub = () => {
    const url = tool.body
      ? `https://github.com/${tool.id}/releases/tag/${tool.version}`
      : tool.extra?.githubUrl;
    if (url) {
      window.electron.openExternal(url);
    }
  };

  const handleTranslate = async () => {
    if (!translateLang || !tool.body) return;
    setTranslating(true);
    try {
      const result = await window.electron.translateText(tool.body, translateLang);
      setTranslated(result);
    } catch {
      setTranslated("Erro ao traduzir. Tente novamente.");
    }
    setTranslating(false);
  };

  const displayBody = translated || tool.body || "";

  return (
    <div className="proton-info-modal-overlay" onClick={onClose}>
      <div className="proton-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="proton-info-modal__header">
          <div>
            <h2>{tool.title}</h2>
            {tool.version && (
              <span className="version-badge">{tool.version}</span>
            )}
          </div>
          <Button onClick={onClose}>✕</Button>
        </div>

        <div className="proton-info-modal__body">
          {tool.body && (
            <div className="proton-info-modal__section">
              <div className="release-notes-header">
                <h3>Release Notes</h3>
                <div className="translate-bar">
                  <select
                    value={translateLang}
                    onChange={(e) => { setTranslateLang(e.target.value); setTranslated(""); }}
                  >
                    <option value="">Original (EN)</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                  <Button
                    onClick={handleTranslate}
                    disabled={!translateLang || translating}
                    style={{ marginLeft: 8 }}
                  >
                    {translating ? "..." : "Traduzir"}
                  </Button>
                  {translated && (
                    <Button
                      onClick={() => setTranslated("")}
                      style={{ marginLeft: 8 }}
                    >
                      Original
                    </Button>
                  )}
                </div>
              </div>
              <div className="readme-content">{displayBody.slice(0, 8000)}</div>
            </div>
          )}

          <div className="proton-info-modal__section">
            <h3>{t("features")}</h3>
            <ul>
              {tool.extra?.features?.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </div>

          <div className="proton-info-modal__section">
            <h3>{t("details")}</h3>
            <div className="proton-info-modal__details">
              {tool.extra?.author && (
                <div className="detail-row">
                  <span className="label">{t("author")}:</span>
                  <span className="value">{tool.extra.author}</span>
                </div>
              )}
              {tool.extra?.license && (
                <div className="detail-row">
                  <span className="label">{t("license")}:</span>
                  <span className="value">{tool.extra.license}</span>
                </div>
              )}
            </div>
          </div>

          <div className="proton-info-modal__footer">
            <Button onClick={openGitHub}>🔗 {t("viewOnGitHub")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
