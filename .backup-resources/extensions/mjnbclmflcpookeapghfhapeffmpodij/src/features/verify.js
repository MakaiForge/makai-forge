import { VERIFY_BASE_URL } from "../core/config.js";
import { getProxyCycleInfo, rotateProxy, disableProxy } from "../core/proxy.js";
import { getState, incrementSuccessfulConnectCount, patchState } from "../core/storage.js";
import { setIcon } from "../core/icon.js";
import { setConnectedFlow, setNoConnectionFlow } from "../core/state.js";
import { log } from "../core/config.js";

const VERIFY_TIMEOUT_SCHEDULE_MS = [2000, 3000, 5000, 3000, 5000, 7000];
const RETRY_DELAY_MS = 500;

let verifying = 0;

function now() {
  return Date.now();
}

function secondsSince(ts) {
  return Math.round((now() - ts) / 1000);
}

function isUltrasurfLandingUrl(url) {
  return typeof url === "string" && url.includes("ultrasurfing.com");
}

async function getTrackedTabInfo(tabId) {
  if (!tabId || tabId <= 0) {
    return { tabid: tabId || 0, active: false };
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const validLanding = isUltrasurfLandingUrl(tab.url);
    return {
      tabid: validLanding ? tabId : -2,
      active: Boolean(validLanding && tab.active)
    };
  } catch {
    return { tabid: -3, active: false };
  }
}

async function getWindowState() {
  try {
    const win = await chrome.windows.getCurrent();
    return win.state || "normal";
  } catch {
    return "normal";
  }
}

function buildVerifyUrl(tag, timeout, state, active, winstate) {
  const params = new URLSearchParams({
    tag: `${tag}${timeout}`,
    last: String(secondsSince(state.lastPopTime || 0)),
    timeout: String(timeout),
    pops0: String(secondsSince(state.popsResetTime || 0)),
    lastV: String(secondsSince(state.lastVerifyTime || 0)),
    lastVTag: state.lastVerifyTag || "init",
    ver: chrome.runtime.getManifest().version,
    pops: String(state.pops || 0),
    active: String(active),
    win: String(winstate),
    uid: state.uid || ""
  });

  return `${VERIFY_BASE_URL}?${params.toString()}`;
}

async function openLanding(link, state, trackedTabId) {
  if (trackedTabId > 0) {
    try {
      await chrome.tabs.remove(trackedTabId);
    } catch {}
  }

  const tab = await chrome.tabs.create({ url: link });
  await patchState({
    tabid: tab.id,
    pops: Number(state.pops || 0) + 1,
    lastPopTime: now()
  });
}

async function resetPopWindow() {
  await patchState({ pops: 0, popsResetTime: now() });
}

async function handleNon200Status(status, trackedTabId, state, tag) {
  if (status < 400) {
    log(`[VERIFY] Non-200 status treated as success: ${status}`);
    await setConnectedFlow(tag);
    if (status === 205) {
      await openLanding("https://ultrasurfing.com", state, trackedTabId);
    }
    return true;
  }
  return false;
}

async function markVerifyFailureState() {
  await setNoConnectionFlow();
}

function getAttemptFetchTimeoutMs(attemptNumber) {
  if (attemptNumber <= 0) return VERIFY_TIMEOUT_SCHEDULE_MS[0];
  return VERIFY_TIMEOUT_SCHEDULE_MS[Math.min(attemptNumber - 1, VERIFY_TIMEOUT_SCHEDULE_MS.length - 1)];
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Verify timeout", "AbortError")), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function resetVerifyLock() {
  verifying = 0;
}

export async function verify(tag, timeout = 0, data = "") {
  const skipLock = !String(tag).includes("web") && timeout <= 0;
  if (skipLock) {
    if (verifying > 0) {
      log(`[VERIFY] Skip duplicate verify tag=${tag} timeout=${timeout}`);
      return;
    }
    verifying += 1;
  }

  const state = await getState();
  if (!state.enabled) {
    verifying = 0;
    log(`[VERIFY] Skip because extension is disabled. tag=${tag} timeout=${timeout}`);
    return;
  }

  await patchState({
    lastVerifyTime: now(),
    lastVerifyTag: tag
  });

  const { tabid, active } = await getTrackedTabInfo(state.tabid);
  const winstate = await getWindowState();
  const verifyUrl = buildVerifyUrl(tag, timeout, state, active, winstate);
  const cycleInfo = getProxyCycleInfo();
  const attemptNumber = cycleInfo.currentAttemptIndex + 1;
  const fetchTimeoutMs = getAttemptFetchTimeoutMs(attemptNumber);
  const startedAt = now();

  log(
    `[VERIFY] Start tag=${tag} timeout=${timeout} fetchTimeout=${fetchTimeoutMs} active=${active} win=${winstate} cycle=${cycleInfo.cycleId} attempt=${attemptNumber}/${cycleInfo.totalAttempts}`
  );

  try {
    const response = await fetchWithTimeout(
      verifyUrl,
      {
        method: "POST",
        body: data
      },
      fetchTimeoutMs
    );

    const elapsed = now() - startedAt;

    if (response.status !== 200) {
      log(`[VERIFY] Non-200 response status=${response.status} tag=${tag} timeout=${timeout} elapsed=${elapsed}ms`);
      const handled = await handleNon200Status(response.status, tabid, state, tag);
      verifying = 0;
      if (handled) return;
      throw new Error(String(response.status));
    }

    const link = await response.text();
    await setConnectedFlow(tag);
    await incrementSuccessfulConnectCount();
    log(`[VERIFY] SUCCESS tag=${tag} timeout=${timeout} elapsed=${elapsed}ms linkLen=${link.length}`);

    if (link.length > 10) {
      await openLanding(link, state, tabid);
    } else if (link.length > 0) {
      await resetPopWindow();
    }

    verifying = 0;
  } catch (error) {
    const elapsed = now() - startedAt;
    const msg = String(error?.message || error || "unknown error");
    log(`[VERIFY] FAILED tag=${tag} timeout=${timeout} elapsed=${elapsed}ms error=${msg}`);

    if (timeout < 0) {
      verifying = 0;
      log(`[VERIFY] Negative timeout, stop retrying. tag=${tag}`);
      return;
    }

    const current = await getState(["enabled"]);
    if (!current.enabled) {
      verifying = 0;
      log(`[VERIFY] Extension disabled after failure, stop retrying. tag=${tag}`);
      return;
    }

    let rotated = false;
    try {
      rotated = await rotateProxy();
    } catch (rotateError) {
      log(`[VERIFY] rotateProxy threw error=${String(rotateError?.message || rotateError || "unknown rotate error")}`);
    }

    const refreshedCycleInfo = getProxyCycleInfo();
    const cycleElapsed = refreshedCycleInfo.startedAt > 0 ? now() - refreshedCycleInfo.startedAt : 0;

    if (!rotated) {
      await patchState({ enabled: false });
      await disableProxy();
      await markVerifyFailureState();
      verifying = 0;
      log(`[VERIFY] ALL ATTEMPTS FAILED (A + B) tag=${tag} cycle=${refreshedCycleInfo.cycleId} cycleElapsed=${cycleElapsed}ms proxyCleared=true enabled=false`);
      return;
    }

    log(
      `[VERIFY] Scheduling retry tag=${tag} delay=${RETRY_DELAY_MS}ms nextTimeout=${getAttemptFetchTimeoutMs(refreshedCycleInfo.currentAttemptIndex + 2)} rotated=${rotated} cycleElapsed=${cycleElapsed}ms`
    );
    setTimeout(() => {
      verify(tag, fetchTimeoutMs, msg);
    }, RETRY_DELAY_MS);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled && changes.enabled.newValue === false) {
    resetVerifyLock();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabid } = await getState(["tabid"]);
  if (tabId === tabid) {
    verify("close", -1).catch(() => {});
  }
});
