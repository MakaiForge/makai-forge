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

registerEvent("toggleFomodComponent", async (_event, stagingDir: string, files: string[], enable: boolean, sourceFiles?: { source: string; destination: string }[]) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  let count = 0;

  if (!enable) {
    // Disable: remove files from staging root
    for (const relPath of files) {
      const fullPath = path.join(stagingDir, relPath);
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
  } else if (sourceFiles && sourceFiles.length > 0) {
    // Enable: copy files from FOMOD source back to staging root
    for (const sf of sourceFiles) {
      const srcPath = path.join(stagingDir, sf.source);
      const destPath = path.join(stagingDir, sf.destination);
      if (!fs.existsSync(srcPath)) continue;

      try {
        if (fs.statSync(srcPath).isDirectory()) {
          // Copy directory recursively
          const copyDir = (src: string, dest: string) => {
            fs.mkdirSync(dest, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
              const s = path.join(src, entry.name);
              const d = path.join(dest, entry.name);
              if (entry.isDirectory()) {
                copyDir(s, d);
              } else {
                if (fs.existsSync(d)) fs.unlinkSync(d);
                fs.copyFileSync(s, d);
                count++;
              }
            }
          };
          copyDir(srcPath, destPath);
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          fs.copyFileSync(srcPath, destPath);
          count++;
        }
      } catch { /* skip */ }
    }
  }

  return { toggled: count, enable };
});

registerEvent("captureFomodComponents", async (_event, stagingDir: string) => {
  return FomodService.captureComponentsRetroactive(stagingDir);
});
