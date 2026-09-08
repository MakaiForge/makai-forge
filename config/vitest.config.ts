import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // environment definido por arquivo com @vitest-environment
  },
  resolve: {
    alias: {
      "@main": resolve("src/main"),
      "@locales": resolve("src/locales"),
      "@resources": resolve("app/_resources"),
      "@shared": resolve("src/shared"),
      "@renderer": resolve("src/renderer/src"),
      "@types": resolve("src/shared/types"),
    },
  },
});
