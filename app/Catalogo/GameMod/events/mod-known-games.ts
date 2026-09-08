import { registerEvent } from "@main/events/register-event";
import { listKnownGames } from "@games/registry";

interface KnownGameInfo {
  name: string
  game_id: string
  steam_id: string
  configured: boolean
  game_path: string
  exe_name: string
  loot_enabled: boolean
  loot_game_type: string
  nexus_game_domain: string
  data_folder_name: string
  plugin_extensions: string[]
}

registerEvent("modListKnownGames", async (): Promise<{ ok: boolean; data?: KnownGameInfo[]; error?: string }> => {
  try {
    const games = listKnownGames();
    const result: KnownGameInfo[] = games.map(g => ({
      name: g.name,
      game_id: g.gameId,
      steam_id: g.steamAppId || "",
      configured: false,
      game_path: "",
      exe_name: g.exeName || "",
      loot_enabled: !!g.lootType,
      loot_game_type: g.lootType || "",
      nexus_game_domain: g.nexusDomain || "",
      data_folder_name: g.dataFolder || ".",
      plugin_extensions: g.dataFolder === "Data" ? [".esl", ".esm", ".esp"] : [],
    }));
    return { ok: true, data: result };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});
