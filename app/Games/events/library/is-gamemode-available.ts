import { isGamemodeAvailable } from "@main/helpers/is-gamemode-available";
import { registerEvent } from "@main/events/register-event";

registerEvent("isGamemodeAvailable", async () => {
  return isGamemodeAvailable();
});
