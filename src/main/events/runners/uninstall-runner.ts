import { registerEvent } from "../register-event";
import { uninstallRunner } from "@emulators/installer";

registerEvent("uninstallRunner", async (_event, runnerId: string) => {
  await uninstallRunner(runnerId);
  return { id: runnerId, isInstalled: false };
});
