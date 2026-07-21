import { log } from "./config.js";
let animationTimer = null;
let animationIndex = 0;

const STATIC_ICONS = {
  connected: { 48: "assets/img/icon/icon_48.png" },
  ready: { 48: "assets/img/icon/icon_BW_48.png" },
  noConnection: { 48: "assets/img/icon/icon_BW_48.png" }
};

const SIGNAL_ICONS = [
  { 48: "assets/img/icon/signal/0.png" },
  { 48: "assets/img/icon/signal/1.png" },
  { 48: "assets/img/icon/signal/2.png" },
  { 48: "assets/img/icon/signal/3.png" }
];

function stopAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

function applyPath(path) {
  try {
    chrome.action.setIcon({ path }, () => {
      if (chrome.runtime.lastError) {
        log(`[ICON] setIcon failed: ${chrome.runtime.lastError.message}`);
      }
    });
  } catch (error) {
    log(`[ICON] setIcon threw: ${String(error?.message || error || "unknown error")}`);
  }
}

export function setIcon(mode) {
  if (mode === "connecting") {
    stopAnimation();
    animationIndex = 0;
    applyPath(SIGNAL_ICONS[animationIndex]);
    animationTimer = setInterval(() => {
      animationIndex = (animationIndex + 1) % SIGNAL_ICONS.length;
      applyPath(SIGNAL_ICONS[animationIndex]);
    }, 400);
    return;
  }

  stopAnimation();
  applyPath(STATIC_ICONS[mode] || STATIC_ICONS.ready);
}
