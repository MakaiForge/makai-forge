import { registerEvent } from "@main/events/register-event";
import * as ModBridge from "@mods/services/mod-bridge-service";

registerEvent("modLoadOrderSort", async (_event, gameId: string, plugins: { filename: string; masters?: string[] }[]) => {
  const result = await ModBridge.sendCommand("loot_sort", {
    game_id: gameId,
    plugins,
  });
  return result;
});

registerEvent("modValidateLoadOrder", async (_event, gameId: string, plugins: { filename: string; masters?: string[] }[]) => {
  const result = await ModBridge.sendCommand("loot_sort", {
    game_id: gameId,
    plugins,
    full: false,
  });
  return {
    ok: result.ok,
    data: {
      validation: result.data?.validation ?? [],
      warnings: result.data?.warnings ?? [],
    },
    error: result.error,
  };
});
