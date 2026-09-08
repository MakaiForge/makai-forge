import { registerEvent } from "../register-event";
import { getCachedFreeGames } from "@main/services/game-deals";

registerEvent("getFreeGamesCached", async () => {
  return getCachedFreeGames();
});
