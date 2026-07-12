import { ensureStateInitialized, getState, incrementEnableCount, incrementRunCount, patchState } from "./src/core/storage.js";
import { enableProxy, disableProxy } from "./src/core/proxy.js";
import { setConnectingFlow, setDisconnectedFlow } from "./src/core/state.js";
import { verify, resetVerifyLock } from "./src/features/verify.js";
import { allowSafeBrowsingTarget, startSafeBrowsingLogging } from "./src/features/safe-browsing.js";

let startupMode = "load";

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureStateInitialized();

  if (details?.reason === "install") {
    await patchState({
      enabled: true,
      state: "disconnect",
      safeBrowsingEnabled: true,
      safeBrowsingDisclosureShown: true,
    });
    await disableProxy();
    await setDisconnectedFlow();

    try {
      await chrome.action.openPopup();
    } catch (_error) {
      // Best-effort only. If this fails, the user will see the disclosure
      // the first time they open the extension manually.
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  startupMode = "open";
});

async function canStartProtection() {
  const { safeBrowsingDisclosureShown } = await getState(["safeBrowsingDisclosureShown"]);
  return safeBrowsingDisclosureShown === true;
}

async function connect(mode = "start") {
  if (!(await canStartProtection())) {
    await patchState({ enabled: false, safeBrowsingEnabled: false });
    await setDisconnectedFlow();
    return;
  }

  const { safeBrowsingEnabled = true } = await getState(["safeBrowsingEnabled"]);
  await patchState({ enabled: true, safeBrowsingEnabled: safeBrowsingEnabled !== false });
  await incrementEnableCount();
  const verifyTag = await setConnectingFlow(mode);
  await enableProxy();
  await verify(verifyTag, 0);
}

async function disconnect() {
  await patchState({ enabled: false });
  resetVerifyLock();
  await disableProxy();
  await setDisconnectedFlow();
}

async function initialize() {
  const state = await ensureStateInitialized();
  await incrementRunCount();

  if (state.safeBrowsingDisclosureShown === true && state.enabled !== false) {
    await connect(startupMode);
  } else {
    await disconnect();
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.user === "connect") {
    connect("start").then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (request?.user === "disconnect") {
    disconnect().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (request?.type === "getState") {
    getState(["enabled", "state", "safeBrowsingDisclosureShown"]).then((state) => sendResponse(state));
    return true;
  }

  if (request?.type === "safeBrowsingProceed") {
    sendResponse({ ok: allowSafeBrowsingTarget(request.target) });
    return true;
  }

  return false;
});

chrome.proxy.onProxyError.addListener((details) => {
  verify("error", 0, details.error).catch(() => {});
});

chrome.alarms.create("update-config", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "update-config") {
    verify("track", -1).catch(() => {});
  }
});

startSafeBrowsingLogging();

initialize().catch(() => {});
