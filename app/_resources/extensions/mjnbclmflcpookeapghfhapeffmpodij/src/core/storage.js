import { STORAGE_DEFAULTS } from "./config.js";

function makeId(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function makeSafeBrowsingUserId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}

export async function getState(keys = null) {
  const items = await chrome.storage.local.get(keys ?? Object.keys(STORAGE_DEFAULTS));
  return { ...STORAGE_DEFAULTS, ...items };
}

export async function patchState(patch) {
  await chrome.storage.local.set(patch);
}

export async function ensureStateInitialized() {
  const current = await getState();
  const patch = {};

  if (!current.uid) patch.uid = makeId(8);
  if (!current.popsResetTime) patch.popsResetTime = Date.now();
  if (typeof current.runCount !== "number") patch.runCount = 0;
  if (typeof current.enableCount !== "number") patch.enableCount = 0;
  if (typeof current.successfulConnectCount !== "number") patch.successfulConnectCount = 0;
  if (typeof current.safeBrowsingDisclosureShown !== "boolean") patch.safeBrowsingDisclosureShown = false;
  if (!current.safeBrowsingUserId) patch.safeBrowsingUserId = makeSafeBrowsingUserId();
  if (!current.safeBrowsingDisclosureShown) {
    patch.safeBrowsingEnabled = true;
  }

  if (Object.keys(patch).length > 0) {
    await patchState(patch);
  }

  return { ...current, ...patch };
}

export async function incrementRunCount() {
  const { runCount = 0 } = await getState(["runCount"]);
  await patchState({ runCount: Number(runCount || 0) + 1 });
}

export async function incrementEnableCount() {
  const { enableCount = 0 } = await getState(["enableCount"]);
  await patchState({ enableCount: Number(enableCount || 0) + 1 });
}

export async function incrementSuccessfulConnectCount() {
  const { successfulConnectCount = 0 } = await getState(["successfulConnectCount"]);
  await patchState({ successfulConnectCount: Number(successfulConnectCount || 0) + 1 });
}


export async function getSafeBrowsingUserId() {
  const { safeBrowsingUserId } = await getState(["safeBrowsingUserId"]);
  if (safeBrowsingUserId) return safeBrowsingUserId;

  const newId = makeSafeBrowsingUserId();
  await patchState({ safeBrowsingUserId: newId });
  return newId;
}
