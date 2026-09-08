import { registerEvent } from "../register-event";
import { getDeals } from "@main/services/game-deals";

registerEvent("getHomeDeals", async () => {
  return getDeals();
});
