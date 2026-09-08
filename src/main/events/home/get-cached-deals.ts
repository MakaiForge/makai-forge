import { registerEvent } from "../register-event";
import { getCachedDeals } from "@main/services/game-deals";

registerEvent("getHomeDealsCached", async () => {
  return getCachedDeals();
});
