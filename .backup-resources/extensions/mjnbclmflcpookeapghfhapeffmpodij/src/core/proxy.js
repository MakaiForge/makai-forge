import { PROXY_HOSTS_A, PROXY_HOSTS_B } from "./config.js";
import { log } from "./config.js";

const ATTEMPTS_PER_POOL = 3;
const HOSTS_PER_ATTEMPT = 3;

let attemptGroups = [];
let currentAttemptIndex = -1;
let connectCycleId = 0;
let connectCycleStartedAt = 0;

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildAttemptGroups(hosts, rounds = ATTEMPTS_PER_POOL, perRound = HOSTS_PER_ATTEMPT) {
  const picked = shuffle(hosts).slice(0, rounds * perRound);
  const groups = [];

  for (let i = 0; i < picked.length; i += perRound) {
    groups.push(picked.slice(i, i + perRound));
  }

  return groups.filter((group) => group.length > 0);
}

function buildPacConfig(hosts) {
  const proxyChain = hosts.map((host) => `HTTPS ${host}:443`).join("; ");
  return {
    value: {
      mode: "pac_script",
      pacScript: {
        data:
          "function FindProxyForURL(url, host) {" +
          "if (host === 'localhost') { return 'SYSTEM;'; }" +
          `return '${proxyChain}';` +
          "}",
        mandatory: true
      }
    }
  };
}

function describeAttempt(index) {
  if (index < 0 || index >= attemptGroups.length) return null;

  const pool = index < ATTEMPTS_PER_POOL ? "A" : "B";
  const round = pool === "A" ? index + 1 : index - ATTEMPTS_PER_POOL + 1;
  const hosts = attemptGroups[index];
  return { pool, round, hosts };
}

export function getProxyCycleInfo() {
  return {
    cycleId: connectCycleId,
    startedAt: connectCycleStartedAt,
    currentAttemptIndex,
    totalAttempts: attemptGroups.length
  };
}

async function applyAttempt(index) {
  if (index < 0 || index >= attemptGroups.length) {
    log(`[PROXY][cycle ${connectCycleId}] No more attempts available (index=${index}).`);
    return false;
  }

  if (index === ATTEMPTS_PER_POOL && currentAttemptIndex < ATTEMPTS_PER_POOL) {
    log(`[PROXY][cycle ${connectCycleId}] Switching from pool A to pool B.`);
  }

  const attempt = describeAttempt(index);
  currentAttemptIndex = index;

  log(
    `[PROXY][cycle ${connectCycleId}] Applying pool ${attempt.pool} round ${attempt.round}: ${attempt.hosts.join(", ")}`
  );

  await chrome.proxy.settings.set(buildPacConfig(attempt.hosts));
  return true;
}

export async function enableProxy() {
  connectCycleId += 1;
  connectCycleStartedAt = Date.now();
  const groupsA = buildAttemptGroups(PROXY_HOSTS_A);
  const groupsB = buildAttemptGroups(PROXY_HOSTS_B);
  attemptGroups = [...groupsA, ...groupsB];
  currentAttemptIndex = -1;

  log(`[PROXY][cycle ${connectCycleId}] Generated A groups:`, groupsA);
  log(`[PROXY][cycle ${connectCycleId}] Generated B groups:`, groupsB);

  return applyAttempt(0);
}

export async function rotateProxy() {
  const nextIndex = currentAttemptIndex + 1;
  const nextAttempt = describeAttempt(nextIndex);

  if (!nextAttempt) {
    log(`[PROXY][cycle ${connectCycleId}] All proxy attempts exhausted.`);
    return false;
  }

  log(
    `[PROXY][cycle ${connectCycleId}] Rotating to pool ${nextAttempt.pool} round ${nextAttempt.round}: ${nextAttempt.hosts.join(", ")}`
  );
  return applyAttempt(nextIndex);
}

export async function disableProxy() {
  log(`[PROXY][cycle ${connectCycleId}] Clearing proxy settings.`);
  attemptGroups = [];
  currentAttemptIndex = -1;
  connectCycleStartedAt = 0;
  await chrome.proxy.settings.clear({});
}
