import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface ActivityEntry {
  type: "request" | "response" | "step" | "event" | "error"
  ts: string
  gameId: string
  [key: string]: unknown
}

function getLogPath(): string {
  try {
    return path.join(app.getAppPath(), "tools", "Mods_manager", "play", "activity.log");
  } catch {
    return path.resolve("activity.log");
  }
}

function write(entry: ActivityEntry): void {
  const line = JSON.stringify(entry, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  ) + "\n";
  try {
    const f = getLogPath();
    const dir = path.dirname(f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(f, line);
  } catch {
    // silent
  }
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

let _stepStart = 0;
let _stepIndex = 0;

export function logStep(
  gameId: string,
  step: string,
  message: string,
  status: "working" | "done" | "error" | "waiting",
  details?: Record<string, unknown>,
): void {
  const now = Date.now();
  const elapsed = _stepStart ? now - _stepStart : 0;
  _stepStart = now;
  _stepIndex++;

  write({
    type: "step",
    ts: ts(),
    gameId,
    step,
    message,
    status,
    stepNumber: _stepIndex,
    elapsed_ms: elapsed,
    ...details,
  } as ActivityEntry);
}

export function resetStepCounter(): void {
  _stepIndex = 0;
  _stepStart = 0;
}

export function logEvent(
  gameId: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  write({
    type: "event",
    ts: ts(),
    gameId,
    event,
    data,
  } as ActivityEntry);
}

export function logError(
  gameId: string,
  operation: string,
  error: string,
): void {
  write({
    type: "error",
    ts: ts(),
    gameId,
    operation,
    error,
  } as ActivityEntry);
}

export function logRequest(
  gameId: string,
  operation: string,
  params?: Record<string, unknown>,
): void {
  write({
    type: "request",
    ts: ts(),
    gameId,
    operation,
    params,
  } as ActivityEntry);
}

export function logResponse(
  gameId: string,
  operation: string,
  result: unknown,
  duration_ms: number,
): void {
  write({
    type: "response",
    ts: ts(),
    gameId,
    operation,
    result: typeof result === "object" ? JSON.parse(JSON.stringify(result)) : result,
    duration_ms,
  } as ActivityEntry);
}
