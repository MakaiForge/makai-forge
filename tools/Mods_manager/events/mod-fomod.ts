import { registerEvent } from "@main/events/register-event";
import { FomodService } from "@mods/services/fomod/fomod-service";

registerEvent("parseFomod", async (_event, stagingDir: string) => {
  return FomodService.parse(stagingDir);
});

registerEvent("installFomod", async (_event, stagingDir: string, targetDir: string, selections: Record<string, string[]>) => {
  return FomodService.install(stagingDir, targetDir, selections);
});

registerEvent("installFomodWithComponents", async (_event, stagingDir: string, targetDir: string, selections: Record<string, string[]>) => {
  return FomodService.installWithComponents(stagingDir, targetDir, selections, true);
});

registerEvent("toggleFomodComponent", async (_event, stagingDir: string, files: string[], enable: boolean) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  let count = 0;
  for (const relPath of files) {
    const fullPath = path.join(stagingDir, relPath);
    if (enable) {
      // Re-parse FOMOD to find source, copy back
      // Files should still exist in staging (we don't delete on toggle-off anymore)
      // If they were deleted, we need the FOMOD source
      // For now, just skip if not found
    } else {
      // Disable: remove the file
      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          count++;
        }
      } catch { /* skip */ }
    }
  }
  return { toggled: count, enable };
});
