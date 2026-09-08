import { registerEvent } from "../register-event";
import { getFreeGames } from "@main/services/game-deals";

registerEvent("getFreeGames", async (_event, language?: string) => {
  return getFreeGames(language);
});
