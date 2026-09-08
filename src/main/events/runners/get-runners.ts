import { registerEvent } from "../register-event";
import { allRunnerDefinitions } from "@emulators/registry";

registerEvent("getRunners", async () => {
  return allRunnerDefinitions;
});
