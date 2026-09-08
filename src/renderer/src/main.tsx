import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { Provider } from "react-redux";
import LanguageDetector from "i18next-browser-languagedetector";
import { HashRouter, Route, Routes } from "react-router-dom";

import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/700.css";

import "react-loading-skeleton/dist/skeleton.css";
import "react-tooltip/dist/react-tooltip.css";

import { App, RouteLoading } from "../../../app/app";

import { store } from "@shared-store";

// Apenas o idioma padrão entra no bundle inicial.
// Os demais idiomas são carregados dinamicamente quando o usuário seleciona.
import en from "@locales/en/translation.json";

import { logger } from "@shared-logger";
import { addCookieInterceptor } from "@shared-cookies";
import * as Sentry from "@sentry/react";
import { storeService } from "@shared-services/store.service";

// Code-splitting das rotas: cada página só é baixada/parseada quando aberta.
// Isso reduz o bundle inicial de ~6,5 MB para apenas o shell do app.
const Catalogue = lazy(() => import("@catalogue"));
const Home = lazy(() => import("@home/home"));
const ProtonToolsPage = lazy(() =>
  import("@proton/renderer/pages/proton-tools/index")
);
const ModManager = lazy(() => import("@mods/ui/ModManager"));
const ExecutableSelect = lazy(() =>
  import("@executable-select/executable-select")
);
const FolderSelect = lazy(() => import("@folder-select/folder-select"));
const Games = lazy(() => import("@games-ui"));
const Downloads = lazy(() => import("@downloads"));
const GameDetails = lazy(() =>
  import("@games-ui/pages/game-details/game-details")
);
const Settings = lazy(() => import("@settings/settings"));
const Emulators = lazy(() => import("@emulators/emulators"));
const EmulatorDetail = lazy(() => import("@emulator-detail/emulator-detail"));
const Profile = lazy(() => import("@profile/profile"));
const ThemeEditor = lazy(() => import("@theme-editor/theme-editor"));
const Notifications = lazy(() => import("@notifications/notifications"));
const GameLauncher = lazy(() =>
  import("@games-ui/pages/game-launcher/game-launcher")
);
const GameLog = lazy(() => import("@games-ui/pages/game-log/game-log"));

console.log = logger.log;

Sentry.init({
  dsn: import.meta.env.RENDERER_VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.5,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  release: "hydra-launcher@" + (await globalThis.electron.getVersion()),
});

const isStaging = await globalThis.electron.isStaging();
addCookieInterceptor(isStaging);

const syncDocumentLanguage = (language: string) => {
  document.documentElement.lang = language;
  document.documentElement.dir = i18n.dir(language);
};

// Carrega o bundle de um idioma sob demanda (ex.: pt-BR/translation.json)
const localeModules = import.meta.glob("../../locales/*/translation.json");

const resources = { en: { translation: en } };

await i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

const userPreferences = (await storeService.get(
  "userPreferences",
  null,
  "json"
)) as { language?: string } | null;

if (userPreferences?.language) {
  const lang = userPreferences.language;
  if (lang !== "en") {
    try {
      const mod = await localeModules[`../../locales/${lang}/translation.json`]();
      i18n.addResourceBundle(
        lang,
        "translation",
        (mod as { default?: Record<string, unknown> }).default ?? (mod as Record<string, unknown>)
      );
    } catch (err) {
      logger.warn(`[i18n] Failed to load locale ${lang}, falling back to en`, err);
    }
  }
  await i18n.changeLanguage(lang);
} else {
  globalThis.electron.updateUserPreferences({ language: i18n.language });
}

syncDocumentLanguage(i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route element={<App />}>
              <Route path="/" element={<Home />} />
              <Route path="/catalogue" element={<Catalogue />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/game/:shop/:objectId" element={<GameDetails />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/proton-tools" element={<ProtonToolsPage />} />
              <Route path="/games" element={<Games />} />
              <Route path="/emulators" element={<Emulators />} />
              <Route path="/emulator/:runnerId" element={<EmulatorDetail />} />
              <Route path="/mod-manager" element={<ModManager />} />
            </Route>

            <Route path="/game-log" element={<GameLog />} />

            <Route path="/executable-select" element={<ExecutableSelect />} />
            <Route path="/folder-select" element={<FolderSelect />} />

            <Route path="/theme-editor" element={<ThemeEditor />} />
            <Route path="/game-launcher" element={<GameLauncher />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
