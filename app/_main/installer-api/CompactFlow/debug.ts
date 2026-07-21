import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { logger } from "@main/services";

const CF_LOG = path.join(app.getPath("userData"), "compatflow-debug.log");

export function cfLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(CF_LOG, line); } catch {}
  logger.info(`[CompatFlow] ${msg}`);
}
