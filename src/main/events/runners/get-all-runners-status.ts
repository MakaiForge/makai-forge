import { registerEvent } from "../register-event";
import { getRunnerStatus } from "@emulators/installer";
import { allRunnerDefinitions } from "@emulators/registry";

registerEvent("getAllRunnersStatus", async () => {
  const results = await Promise.all(
    allRunnerDefinitions.map((def) => getRunnerStatus(def).catch(() => null))
  );
  return Object.fromEntries(
    allRunnerDefinitions.map((def, i) => [def.id, results[i]])
  );
});
