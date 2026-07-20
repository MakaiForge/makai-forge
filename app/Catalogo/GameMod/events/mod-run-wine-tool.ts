import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { WineToolRunner } from "@main/services/wine-tools";

registerEvent("modRunWineTool", async (_event, gameId: string, tool: string) => {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  if (!config?.protonPrefix) return { success: false, error: "No prefix configured" };

  const runner = new WineToolRunner(
    config.protonPrefix,
    gameId,
    config.protonVersion || null
  );

  const result = await runner.run(tool as any);
  return { success: result.success, error: result.error };
});
