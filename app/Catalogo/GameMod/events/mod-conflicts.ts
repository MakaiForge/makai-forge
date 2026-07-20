import { registerEvent } from "@main/events/register-event";
import { ModConflictService } from "@mods/services/mod-conflict-service";

registerEvent("detectConflicts", async (_event, gameId: string, enabledMods: { name: string; priority: number }[]) => {
  return ModConflictService.detectConflicts(gameId, enabledMods);
});
