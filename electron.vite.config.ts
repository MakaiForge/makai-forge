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
        },
      },
      plugins: [svgr(), react()],
    },
  };
});
