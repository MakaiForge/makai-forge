import { registerEvent } from "../register-event";
import { getRunnerStatus } from "@emulators/installer";
import { getRunnerById } from "@emulators/registry";

registerEvent("getRunnerStatus", async (_event, runnerId: string) => {
  const def = getRunnerById(runnerId);
  if (!def) throw new Error(`Runner não encontrado: ${runnerId}`);
  return getRunnerStatus(def);
});
