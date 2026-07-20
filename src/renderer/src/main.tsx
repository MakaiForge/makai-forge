import React from "react";
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

import { App } from "./app";

import { store } from "./store";

import resources from "@locales";

import { logger } from "./logger";
import { addCookieInterceptor } from "./cookies";
import * as Sentry from "@sentry/react";
import { storeService } from "./services/store.service";
import Catalogue from "@catalogue";
import Home from "@home/home";
import ProtonToolsPage from "@proton/renderer/pages/proton-tools/index";
import ModManager from "@mods/ui/ModManager";
import ExecutableSelect from "./pages/executable-select/executable-select";
import FolderSelect from "./pages/folder-select/folder-select";
import Games from "@games-ui";
import Downloads from "@downloads";
import GameDetails from "@games-ui/pages/game-details/game-details";
import Settings from "@settings/settings";
import Emulators from "@emulators/emulators";
import EmulatorDetail from "@emulator-detail/emulator-detail";
import Profile from "@profile/profile";
import ThemeEditor from "./pages/theme-editor/theme-editor";
import Notifications from "./pages/notifications/notifications";
import GameLauncher from "@games-ui/pages/game-launcher/game-launcher";
import GameLog from "@games-ui/pages/game-log/game-log";

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
  await i18n.changeLanguage(userPreferences.language);
} else {
  globalThis.electron.updateUserPreferences({ language: i18n.language });
}

syncDocumentLanguage(i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
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
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
