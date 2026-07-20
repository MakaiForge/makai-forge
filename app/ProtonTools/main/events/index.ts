import { getTools, getToolsByCategory, getReleases, downloadTool, getInstalledTools, getInstallDir, removeToolByPath } from "@proton/main/services/index";
import type { ProtonRelease } from "@proton/main/services/types";
import { logger } from "@main/services/logger";
import { registerEvent } from "@main/events/register-event";
import { fetchReadme } from "@main/services/github";
import { translateText } from "@main/services/translate";
import "./recommend-proton";
import "./install-game-with-proton";
import "./analyze-game-exe";
import "./get-fork-catalog";
import "./get-proton-db";

export function registerProtonEvents() {
  registerEvent("getProtonTools", () => {
    return getTools();
  });

  registerEvent("getProtonToolsByCategory", (_event, category: string) => {
    return getToolsByCategory(category);
  });

  registerEvent("getProtonReleases", async (_event, toolId: string) => {
    return await getReleases(toolId);
  });

  registerEvent(
    "downloadProtonTool",
    async (_event, toolId: string, release: ProtonRelease) => {
      const success = await downloadTool({ toolId, release });
      return success;
    }
  );

  registerEvent("getInstalledProtonTools", () => {
    return getInstalledTools();
  });

  registerEvent("getProtonInstallDir", () => {
    return getInstallDir();
  });

  registerEvent(
    "removeProtonTool",
    (_event, toolId: string, version: string) => {
      return removeToolByPath(toolId, version);
    }
  );

  registerEvent("fetchProtonReadme", async (_event, repoUrl: string) => {
    return await fetchReadme({ repoUrl });
  });

  registerEvent("translateText", async (_event, text: string, targetLang: string) => {
    return await translateText(text, targetLang);
  });

  logger.info("Proton events registered");
}
