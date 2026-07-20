import type { GameShop } from "@types";

import Color from "color";
import i18next from "i18next";
import { v4 as uuidv4 } from "uuid";
import { THEME_WEB_STORE_URL } from "./constants";

export const formatDownloadProgress = (
  progress?: number,
  fractionDigits?: number
) => {
  if (!progress) return "0%";
  const progressPercentage = progress * 100;

  if (Number(progressPercentage.toFixed(fractionDigits ?? 2)) % 1 === 0)
    return `${Math.floor(progressPercentage)}%`;

  return `${progressPercentage.toFixed(fractionDigits ?? 2)}%`;
};

export const getSteamLanguage = (language: string) => {
  if (language.startsWith("pt")) return "brazilian";
  if (language.startsWith("es")) return "spanish";
  if (language.startsWith("fr")) return "french";
  if (language.startsWith("ru") || language.startsWith("be")) return "russian";
  if (language.startsWith("it")) return "italian";
  if (language.startsWith("hu")) return "hungarian";
  if (language.startsWith("pl")) return "polish";
  if (language.startsWith("zh")) return "schinese";
  if (language.startsWith("da")) return "danish";

  return "english";
};

export const buildGameDetailsPath = (
  game: { shop: GameShop; objectId: string; title: string },
  params: Record<string, string> = {}
) => {
  const searchParams = new URLSearchParams({ title: game.title, ...params });
  return `/game/${game.shop}/${game.objectId}?${searchParams.toString()}`;
};

export const darkenColor = (color: string, amount: number, alpha: number = 1) =>
  new Color(color).darken(amount).alpha(alpha).toString();

export const injectCustomCss = (
  css: string,
  target: HTMLElement = document.head
) => {
  try {
    target.querySelector("#custom-css")?.remove();
    target.querySelectorAll("#custom-css-imports, #custom-css-fonts")?.forEach(el => el.remove());

    if (css.startsWith(THEME_WEB_STORE_URL)) {
      const link = document.createElement("link");
      link.id = "custom-css";
      link.rel = "stylesheet";
      link.href = css;
      target.appendChild(link);
      return;
    }

    const importRegex = /@import\s+(url\()?['"]([^'"]+)['"]\)?;?\s*/g;
    const fontFaceRegex = /@font-face\s*{[^}]+}/g;

    let match: RegExpExecArray | null;
    let imports = "";
    while ((match = importRegex.exec(css)) !== null) {
      imports += match[0] + "\n";
    }
    if (imports) {
      const importStyle = document.createElement("style");
      importStyle.id = "custom-css-imports";
      importStyle.textContent = imports;
      target.appendChild(importStyle);
    }

    const fontFaces: string[] = [];
    while ((match = fontFaceRegex.exec(css)) !== null) {
      fontFaces.push(match[0]);
    }
    if (fontFaces.length > 0) {
      const fontStyle = document.createElement("style");
      fontStyle.id = "custom-css-fonts";
      fontStyle.textContent = fontFaces.join("\n");
      target.appendChild(fontStyle);
    }

    let cleanCss = css.replace(importRegex, "").replace(fontFaceRegex, "").trim();
    const style = document.createElement("style");
    style.id = "custom-css";
    style.textContent = cleanCss;
    target.appendChild(style);
  } catch (error) {
    console.error("failed to inject custom css:", error);
  }
};

export const removeCustomCss = (target: HTMLElement = document.head) => {
  target.querySelector("#custom-css")?.remove();
  target.querySelector("#custom-css-imports")?.remove();
  target.querySelector("#custom-css-fonts")?.remove();
};

const appliedThemeVars = new Set<string>();

export const applyThemeVars = (vars: Record<string, string>) => {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
    appliedThemeVars.add(key);
  }

  // Deriva --accent-* se o tema setou --accent mas não os derivados
  const accent = vars["--accent"];
  if (accent) {
    try {
      const accentColor = new Color(accent);

      if (!vars["--accent-hover"]) {
        const hover = accentColor.darken(0.15).toString();
        root.style.setProperty("--accent-hover", hover);
        appliedThemeVars.add("--accent-hover");
      }

      if (!vars["--accent-gradient"]) {
        const lighter = accentColor.lighten(0.25).toString();
        root.style.setProperty("--accent-gradient", `linear-gradient(135deg, ${accent}, ${lighter})`);
        appliedThemeVars.add("--accent-gradient");
      }

      if (!vars["--accent-gradient-hover"]) {
        const darker = accentColor.darken(0.12).toString();
        const moreDarker = accentColor.darken(0.22).toString();
        root.style.setProperty("--accent-gradient-hover", `linear-gradient(135deg, ${darker}, ${moreDarker})`);
        appliedThemeVars.add("--accent-gradient-hover");
      }

      if (!vars["--card-hover-shadow"]) {
        root.style.setProperty("--card-hover-shadow", `0 8px 24px color-mix(in srgb, ${accent} 15%, transparent)`);
        appliedThemeVars.add("--card-hover-shadow");
      }

      if (!vars["--sidebar-active-color"]) {
        root.style.setProperty("--sidebar-active-color", accent);
        appliedThemeVars.add("--sidebar-active-color");
      }

      if (!vars["--sidebar-active-glow-color"]) {
        root.style.setProperty("--sidebar-active-glow-color", `color-mix(in srgb, ${accent} 25%, transparent)`);
        appliedThemeVars.add("--sidebar-active-glow-color");
      }

      if (!vars["--el-sidebar-active-color"]) {
        root.style.setProperty("--el-sidebar-active-color", accent);
        appliedThemeVars.add("--el-sidebar-active-color");
      }

      if (!vars["--el-sidebar-active-glow-color"]) {
        root.style.setProperty("--el-sidebar-active-glow-color", `color-mix(in srgb, ${accent} 25%, transparent)`);
        appliedThemeVars.add("--el-sidebar-active-glow-color");
      }

      if (!vars["--el-sidebar-item-active"] && !vars["--sidebar-item-active"]) {
        root.style.setProperty("--el-sidebar-item-active", accent);
        appliedThemeVars.add("--el-sidebar-item-active");
      }
    } catch {
      // cor inválida, ignora
    }
  }
};

export const removeThemeVars = () => {
  const root = document.documentElement;
  for (const key of appliedThemeVars) {
    root.style.removeProperty(key);
  }
  appliedThemeVars.clear();
};

export const generateRandomGradient = (): string => {
  // Use a single consistent gradient with softer colors for custom games as placeholder
  const color1 = "#2c3e50"; // Dark blue-gray
  const color2 = "#34495e"; // Darker slate

  // Create SVG data URL that works in img tags
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grad)" />
  </svg>`;

  // Return as data URL that works in img tags
  return `data:image/svg+xml;base64,${btoa(svgContent)}`;
};

export const formatNumber = (num: number): string => {
  const locale = i18next.resolvedLanguage || i18next.language || undefined;

  return new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(num);
};

/**
 * Generates a UUID v4
 * @returns A random UUID string
 */
export const generateUUID = (): string => {
  return uuidv4();
};

export const getGameKey = (shop: GameShop, objectId: string): string => {
  return `${shop}:${objectId}`;
};
