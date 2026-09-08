import { registerEvent } from "../register-event";
import { checkForRunnerUpdates, shouldCheckForUpdates, getRunnersWithUpdates } from "@emulators/updater";

registerEvent("checkRunnerUpdates", async (_event, runnerId?: string) => {
  return checkForRunnerUpdates(runnerId);
});

registerEvent("shouldCheckRunnerUpdates", async () => {
  return shouldCheckForUpdates();
});

registerEvent("getRunnersWithUpdates", async () => {
  return getRunnersWithUpdates();
});
