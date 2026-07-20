import { isMangohudAvailable } from "@main/helpers/is-mangohud-available";
import { registerEvent } from "@main/events/register-event";

registerEvent("isMangohudAvailable", async () => {
  return isMangohudAvailable();
});
