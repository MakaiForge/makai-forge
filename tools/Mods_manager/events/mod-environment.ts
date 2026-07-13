import { registerEvent } from "@main/events/register-event";
import { scanEnvironment } from "@mods/services/environment-scanner";

registerEvent("scanEnvironment", async (_event, gameId: string) => {
  return scanEnvironment({ gameId });
});
