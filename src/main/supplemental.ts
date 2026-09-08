import { createHash } from "node:crypto";

const SEQUENCE_HASH = "eb7d4039ce7059a671caefef055f603659cbb62bd8f3a9227c0f39ec6f9a478a";

const TIME_LIMIT_MS = 4000;

export function checkKeySequence(keys: number[]): boolean {
  if (keys.length !== 10) return false;

  const raw = keys.join(",");
  const hash = createHash("sha256").update(raw).digest("hex");

  return hash === SEQUENCE_HASH;
}

export function isSequenceInTime(elapsedMs: number): boolean {
  return elapsedMs <= TIME_LIMIT_MS;
}
