import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { getGameModule } from "@games/registry";
import { ensureFrameworks, isFrameworkInstalled } from "@mods/services/framework-installer";

/**
 * Check which frameworks are installed/missing for a game.
 */
registerEvent("checkFrameworks", async (_event, gameId: string) => {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const gamePath = config?.gamePath;
  if (!gamePath) return { frameworks: [], gamePath: null };

  const mod = getGameModule(gameId, gamePath);
  const frameworks = mod?.getAutoInstallFrameworks?.() || [];

  return {
    frameworks: frameworks.map(fw => ({
      name: fw.name,
      installed: isFrameworkInstalled(gamePath, fw),
    })),
    gamePath,
  };
});

/**
 * Install all missing frameworks for a game.
 */
registerEvent("installFrameworks", async (event, gameId: string) => {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const gamePath = config?.gamePath;
  if (!gamePath) return { success: false, error: "Game path not configured" };

  const mod = getGameModule(gameId, gamePath);
  const frameworks = mod?.getAutoInstallFrameworks?.() || [];

  if (frameworks.length === 0) {
    return { success: true, installed: [], skipped: [], failed: [] };
  }

  const result = await ensureFrameworks(gamePath, frameworks, (step, msg, type) => {
    try {
      event.sender.send("onModLaunchProgress", { step, message: msg, type });
    } catch { /* webContents may be destroyed */ }
  });

  return {
    success: result.failed.length === 0,
    ...result,
  };
});
