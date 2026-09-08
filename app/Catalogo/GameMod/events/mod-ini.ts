import { registerEvent } from "@main/events/register-event";

registerEvent("listIniFiles", async (_event, profileDir: string) => {
  const fs = await import("node:fs");
  const p = await import("node:path");
  const iniFiles: { name: string; path: string; content: string }[] = [];
  try {
    const entries = fs.readdirSync(profileDir);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(".ini")) {
        const fullPath = p.join(profileDir, entry);
        const content = fs.readFileSync(fullPath, "utf-8");
        iniFiles.push({ name: entry, path: fullPath, content });
      }
    }
  } catch {}
  return iniFiles;
});


