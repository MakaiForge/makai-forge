import { getSafeBrowsingUserId } from "../core/storage.js";
import { log } from "../core/config.js";

const SAFE_BROWSING_ENDPOINT = "https://safe.ultrasurfing.com/check";
const SAFE_BROWSING_TIMEOUT_MS = 500;
const SAFE_BROWSING_OVERRIDE_TTL_MS = 30 * 60 * 1000;

const tabUrls = new Map();
const tabInitiators = new Map();
const lastSentByTab = new Map();
const allowedUntilByUrl = new Map();

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  if (!isHttpUrl(value)) return null;
  try {
    const u = new URL(value);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function isSafeBrowsingActive() {
  const { safeBrowsingEnabled, safeBrowsingDisclosureShown } = await chrome.storage.local.get([
    "safeBrowsingEnabled",
    "safeBrowsingDisclosureShown",
  ]);
  return safeBrowsingEnabled !== false && safeBrowsingDisclosureShown === true;
}

function clearExpiredOverrides() {
  const now = Date.now();
  for (const [url, until] of allowedUntilByUrl.entries()) {
    if (until <= now) {
      allowedUntilByUrl.delete(url);
    }
  }
}

function isTemporarilyAllowed(normalizedUrl) {
  clearExpiredOverrides();
  const until = allowedUntilByUrl.get(normalizedUrl);
  return typeof until === "number" && until > Date.now();
}

export function allowSafeBrowsingTarget(targetUrl) {
  const normalizedUrl = normalizeUrl(targetUrl);
  if (!normalizedUrl) return false;
  allowedUntilByUrl.set(
    normalizedUrl,
    Date.now() + SAFE_BROWSING_OVERRIDE_TTL_MS
  );
  log("[SafeBrowsing] temporary allow", {
    url: normalizedUrl,
    ttlMs: SAFE_BROWSING_OVERRIDE_TTL_MS,
  });
  return true;
}

async function sendClickstream(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SAFE_BROWSING_TIMEOUT_MS);

  try {
    const response = await fetch(SAFE_BROWSING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    log("[SafeBrowsing] sent", {
      endpoint: SAFE_BROWSING_ENDPOINT,
      status: response.status,
      ok: response.ok,
      payload,
      response: data,
    });
    return data;
  } catch (error) {
    console.warn("[SafeBrowsing] send failed", {
      endpoint: SAFE_BROWSING_ENDPOINT,
      payload,
      error: String(error),
    });
    return { action: "allow" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function warningPageUrl(targetUrl) {
  return (
    chrome.runtime.getURL("ui/warning.html") +
    "?target=" +
    encodeURIComponent(targetUrl)
  );
}

export function startSafeBrowsingLogging() {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabUrls.delete(tabId);
    tabInitiators.delete(tabId);
    lastSentByTab.delete(tabId);
  });

  chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
    try {
      if (!(await isSafeBrowsingActive())) return;

      const sourceTabId = details.sourceTabId;
      const tabId = details.tabId;

      const referrer = tabUrls.get(sourceTabId) || "";
      const normalizedReferrer = normalizeUrl(referrer) || "";

      if (normalizedReferrer) {
        tabInitiators.set(tabId, normalizedReferrer);
      }

      log("[SafeBrowsing] createdNavigationTarget", {
        source: "webNavigation.onCreatedNavigationTarget",
        tabId,
        sourceTabId,
        referrer: normalizedReferrer,
      });
    } catch (err) {
      console.warn("[SafeBrowsing] onCreatedNavigationTarget error", err);
    }
  });
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
      // 1. Safely extract the URL. Fallback to our cache if Chrome hides it during a refresh.
      const targetUrl = changeInfo.url || tab.url || tabUrls.get(tabId);
      if (!targetUrl) return;
  
      const normalizedUrl = normalizeUrl(targetUrl);
      if (!normalizedUrl) return;
  
      // 2. We ONLY want to trigger API checks on two specific user actions:
      //    A) A new URL navigation (clicking a link, typing in address bar, SPA routing)
      //    B) A page refresh (the status changes to 'loading' but the URL didn't change)
      const isUrlChange = changeInfo.url !== undefined;
      const isRefreshEvent = changeInfo.status === "loading" && !changeInfo.url;
  
      if (!isUrlChange && !isRefreshEvent) return;
  
      if (!(await isSafeBrowsingActive())) return;
      if (isTemporarilyAllowed(normalizedUrl)) return;
  
      // 3. Time-based Debounce
      // Chrome fires multiple 'loading' events per refresh. We use a 1-second debounce 
      // to ensure we only send ONE backend request per actual user action.
      const now = Date.now();
      const lastSent = lastSentByTab.get(tabId);
      
      // Safely handle both strings (from webNavigation) and objects (from this function)
      const lastSentUrl = typeof lastSent === "string" ? lastSent : lastSent?.url;
      const lastSentTime = typeof lastSent === "string" ? 0 : lastSent?.timestamp || 0;
  
      if (lastSentUrl === normalizedUrl) {
        const timeSinceLastCheck = now - lastSentTime;
        if (timeSinceLastCheck < 1000) return; // Ignore duplicate browser events
      }
  
      // 4. Update state caches BEFORE awaiting the fetch to prevent race conditions
      const previousUrl = tabUrls.get(tabId) || "";
      const normalizedPreviousUrl = normalizeUrl(previousUrl) || "";
      const initiatorReferrer = tabInitiators.get(tabId) || "";
      const normalizedReferrer = initiatorReferrer || normalizedPreviousUrl || "";
  
      tabUrls.set(tabId, targetUrl);
      // Store as an object so we can track the timestamp for the next refresh
      lastSentByTab.set(tabId, { url: normalizedUrl, timestamp: now });
  
      if (tabInitiators.has(tabId)) {
        tabInitiators.delete(tabId);
      }
  
      const payload = {
        url: normalizedUrl,
        referrer: normalizedReferrer,
        userId: await getSafeBrowsingUserId(),
      };
  
      const result = await sendClickstream(payload);
      if (result?.action === "block") {
        await chrome.tabs.update(tabId, { url: warningPageUrl(normalizedUrl) });
      }
    } catch (err) {
      console.warn("[SafeBrowsing] tabs.onUpdated error", err);
    }
  });
}
