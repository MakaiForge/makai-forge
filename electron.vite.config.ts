import react from "@vitejs/plugin-react";
import {
  defineConfig,
  externalizeDepsPlugin,
  loadEnv,
  swcPlugin,
} from "electron-vite";
import { resolve } from "path";
import svgr from "vite-plugin-svgr";

export default defineConfig(({ mode }) => {
  loadEnv(mode);

  return {
    main: {
      build: {
        sourcemap: true,
        rollupOptions: {
          external: ["jsdom", "canvas"],
        },
      },
      resolve: {
        alias: {
          "@main": resolve("src/main"),
          "@mods": resolve("app/Catalogo/GameMod"),
          "@mods-manager": resolve("app/Catalogo/GameMod"),
          "@games": resolve("app/Catalogo/GameMod/games"),
          "@locales": resolve("src/locales"),
          "@shared": resolve("src/shared"),
          "@emulators": resolve("app/_main/emulators"),
          "@provision": resolve("app/_main/installer-api"),
          "@bootstrap": resolve("app/_main/bootstrap"),
          "@proton": resolve("app/ProtonTools"),
          "@container": resolve("app/_main/container"),
          "@game-launcher": resolve("app/Games/services/game-launcher"),
          "@games-ui": resolve("app/Games"),
          "@home": resolve("app/Home"),
          "@assets": resolve("app/_assets"),
        },
      },
      plugins: [externalizeDepsPlugin(), swcPlugin()],
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      build: {
        sourcemap: true,
      },
      css: {
        preprocessorOptions: {
          scss: {
            api: "modern",
            loadPaths: [resolve("app/_styles")],
          },
        },
      },
      resolve: {
        alias: {
          // @renderer removido — usar @components, @hooks, @features, etc.
          "@mods": resolve("app/Catalogo/GameMod"),
          "@mods-manager": resolve("app/Catalogo/GameMod"),
          "@locales": resolve("src/locales"),
          "@shared": resolve("src/shared"),
          "@container": resolve("app/_main/container"),
          "@provision": resolve("app/_main/installer-api"),
          "@proton": resolve("app/ProtonTools"),
          "@game-launcher": resolve("app/Games/services/game-launcher"),
          "@games-ui": resolve("app/Games"),
          "@home": resolve("app/Home"),
          "@catalogue": resolve("app/Catalogue"),
          "@downloads": resolve("app/Downloads"),
          "@settings": resolve("app/Settings"),
          "@profile": resolve("app/Profile"),
          "@emulator-detail": resolve("app/EmulatorDetail"),
          "@emulators": resolve("app/Emulators"),
          "@executable-select": resolve("app/ExecutableSelect"),
          "@folder-select": resolve("app/FolderSelect"),
          "@library": resolve("app/Library"),
          "@scripts": resolve("app/Scripts"),
          "@notifications": resolve("app/Notifications"),
          "@shared-modals": resolve("app/SharedModals"),
          "@theme-editor": resolve("app/ThemeEditor"),
          "@components": resolve("app/_shared/components"),
          "@hooks": resolve("app/_shared/hooks"),
          "@context": resolve("app/_shared/context"),
          "@features": resolve("app/_shared/features"),
          "@shared-services": resolve("app/_shared/services"),
          "@shared-utils": resolve("app/_shared/utils"),
          "@shared-store": resolve("app/_shared/store.ts"),
          "@shared-logger": resolve("app/_shared/logger"),
          "@shared-helpers": resolve("app/_shared/helpers.ts"),
          "@shared-constants": resolve("app/_shared/constants.ts"),
          "@shared-cookies": resolve("app/_shared/cookies.ts"),
          "@styles": resolve("app/_styles"),
          "@assets": resolve("app/_assets"),
          "@theme": resolve("app/_styles/theme"),
        },
      },
      plugins: [svgr(), react()],
    },
  };
});
