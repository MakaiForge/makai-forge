import { registerEvent } from "@main/events/register-event";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";

registerEvent("eslify", async (_event, pluginPath: string, dryRun: boolean = false, safeCheck: boolean = true) => {
  try {
    const result = await MakaiRPC.call("eslify", {
      plugin_path: pluginPath,
      dry_run: dryRun,
      safe_check: safeCheck,
    });
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
