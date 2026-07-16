import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

function getLogPath(): string {
  try {
    return path.join(app.getAppPath(), "tools", "Mods_manager", "play", "play.log");
  } catch {
    return path.resolve("play.log");
  }
}

export function logPlay(
  gameId: string,
  step: string,
  extra: Record<string, string> = {},
): void {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const extras = Object.entries(extra)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const line = `[${ts}] ${step} | ${gameId} ${extras}`.trimEnd() + "\n";
  try {
    const f = getLogPath();
    const dir = path.dirname(f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(f, line);
  } catch {
    // silent
  }
}
