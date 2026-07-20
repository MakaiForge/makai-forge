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
      },
      resolve: {
        alias: {
          "@main": resolve("src/main"),
          "@mods": resolve("app/Catalogo/GameMod"),
          "@mods-manager": resolve("app/Catalogo/GameMod"),
          "@games": resolve("app/Catalogo/GameMod/games"),
          "@locales": resolve("src/locales"),
          "@resources": resolve("resources"),
          "@shared": resolve("src/shared"),
          "@emulators": resolve("tools/emulators"),
          "@provision": resolve("data/install-api"),
          "@bootstrap": resolve("data/Bootstrap"),
          "@proton": resolve("app/ProtonTools"),
          "@prefix": resolve("tools/prefix"),
          "@game-launcher": resolve("app/Games/services/game-launcher"),
          "@games-ui": resolve("app/Games"),
          "@home": resolve("app/Home"),
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
            loadPaths: [resolve("scss")],
          },
        },
      },
      resolve: {
        alias: {
          "@renderer": resolve("src/renderer/src"),
          "@mods": resolve("app/Catalogo/GameMod"),
          "@mods-manager": resolve("app/Catalogo/GameMod"),
          "@locales": resolve("src/locales"),
          "@shared": resolve("src/shared"),
          "@resources": resolve("resources"),
          "@prefix": resolve("tools/prefix"),
          "@provision": resolve("data/install-api"),
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
          "@shared-services": resolve("app/_shared/services"),
          "@shared-utils": resolve("app/_shared/utils"),
          "@features": resolve("app/_shared/features"),
          "@shared-store": resolve("app/_shared"),
          "@theme": resolve("src/renderer/src/theme"),
        },
      },
      plugins: [svgr(), react()],
    },
  };
});
