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
          "@proton": resolve("app/Catalogo/GameMod/proton-tools"),
          "@prefix": resolve("tools/prefix"),
          "@game-launcher": resolve("tools/game_launcher"),
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
          "@proton": resolve("app/Catalogo/GameMod/proton-tools"),
          "@game-launcher": resolve("tools/game_launcher"),
        },
      },
      plugins: [svgr(), react()],
    },
  };
});
