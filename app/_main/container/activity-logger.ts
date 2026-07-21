import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface PrefixActivityEntry {
  type: "prefix_operation" | "prefix_call" | "prefix_error"
  ts: string
  operation: string
  status: "started" | "success" | "error"
  [key: string]: unknown
}

function getLogPath(): string {
  try {
    return path.join(app.getAppPath(), "tools", "prefix", "activity.log");
  } catch {
    return path.resolve("activity.log");
  }
}

function write(entry: PrefixActivityEntry): void {
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

export function logOperation(
  operation: string,
  status: "started" | "success" | "error",
  details: Record<string, unknown> = {},
): void {
  write({
    type: "prefix_operation",
    ts: ts(),
    operation,
    status,
    ...details,
  } as PrefixActivityEntry);
}

export function logCall(
  caller: string,
  functionName: string,
  args: Record<string, unknown>,
  result: unknown = null,
  duration_ms: number = 0,
): void {
  write({
    type: "prefix_call",
    ts: ts(),
    caller,
    function: functionName,
    args: sanitize(args),
    result: result !== null ? sanitize(result) : undefined,
    duration_ms,
  } as unknown as PrefixActivityEntry);
}

export function logError(
  operation: string,
  error: string,
  details: Record<string, unknown> = {},
): void {
  write({
    type: "prefix_error",
    ts: ts(),
    operation,
    error,
    ...details,
  } as PrefixActivityEntry);
}

function sanitize(v: unknown): unknown {
  if (typeof v === "string" && v.length > 300) return v.slice(0, 300) + "...";
  if (typeof v === "object" && v !== null) {
    const s = JSON.stringify(v);
    if (s.length > 2000) return JSON.parse(s.slice(0, 2000) + "}");
    return v;
  }
  return v;
}
