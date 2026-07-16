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
          "@mods": resolve("tools/Mods_manager"),
          "@mods-manager": resolve("tools/Mods_manager"),
          "@games": resolve("tools/Mods_manager/games"),
          "@locales": resolve("src/locales"),
          "@resources": resolve("resources"),
          "@shared": resolve("src/shared"),
          "@emulators": resolve("tools/emulators"),
          "@provision": resolve("data/install-api"),
          "@bootstrap": resolve("data/Bootstrap"),
          "@proton": resolve("tools/proton-tools"),
          "@prefix": resolve("tools/prefix"),
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
          "@mods": resolve("tools/Mods_manager"),
          "@mods-manager": resolve("tools/Mods_manager"),
          "@locales": resolve("src/locales"),
          "@shared": resolve("src/shared"),
          "@resources": resolve("resources"),
          "@prefix": resolve("tools/prefix"),
          "@provision": resolve("data/install-api"),
          "@proton": resolve("tools/proton-tools"),
        },
      },
      plugins: [svgr(), react()],
    },
  };
});
