import { isWinetricksAvailable } from "@main/helpers/is-winetricks-available";
import { registerEvent } from "@main/events/register-event";

registerEvent("isWinetricksAvailable", async () => {
  return isWinetricksAvailable();
});
