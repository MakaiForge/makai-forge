import { registerEvent } from "@main/events/register-event";
import { ensureGamePrefix } from "../core/init";
import { logOperation } from "../activity-logger";

registerEvent("ensureGamePrefix", async (_event, appId: string, protonName?: string) => {
  logOperation("event:ensureGamePrefix", "started", { appId, protonName });
  const result = await ensureGamePrefix({ appId, protonName });
  logOperation("event:ensureGamePrefix", result.success ? "success" : "error", {
    appId, protonName,
    pfxDir: result.pfxDir,
    error: result.error,
  });
  return result;
});
