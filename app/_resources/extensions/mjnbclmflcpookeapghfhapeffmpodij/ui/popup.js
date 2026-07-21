const enabledToggle = document.getElementById("enabledToggle");
const stateText = document.getElementById("stateText");
const stateMessage = document.getElementById("stateMessage");
const title = document.getElementById("title");
const subtitle = document.getElementById("subtitle");
const modeLabel = document.getElementById("modeLabel");
const reviewBox = document.getElementById("reviewBox");
const reviewTitle = document.getElementById("reviewTitle");
const stars = Array.from(document.querySelectorAll("#stars .star"));
const ratingText = document.getElementById("ratingText");
const reviewThankYou = document.getElementById("reviewThankYou");
const mainUi = document.getElementById("mainUi");
const popupRoot = document.querySelector(".popup");

const settingsButton = document.getElementById("openSettings");
const settingsPanel = document.getElementById("settingsPanel");
const safeBrowsingToggle = document.getElementById("safeBrowsingToggle");
const safeBrowsingDisclosure = document.getElementById("safeBrowsingDisclosure");
const safeBrowsingDisclosureAccept = document.getElementById("safeBrowsingDisclosureAccept");

const RATING_LABELS = {
  1: "Poor",
  2: "Not great",
  3: "Okay",
  4: "Good",
  5: "Love it!",
};

const FIRST_PROMPT_CONNECTS = 3;
const REPROMPT_EXTRA_CONNECTS = 2;
const REPROMPT_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
const SAFE_BROWSING_DISCLOSURE_KEY = "safeBrowsingDisclosureShown";

function resizePopup() {
  requestAnimationFrame(() => {
    const contentHeight = Math.ceil(popupRoot.scrollHeight);
    const contentWidth = Math.ceil(popupRoot.scrollWidth);
    document.documentElement.style.width = `${contentWidth}px`;
    document.body.style.width = `${contentWidth}px`;
    document.documentElement.style.height = `${contentHeight}px`;
    document.body.style.height = `${contentHeight}px`;
  });
}

let ratingLocked = false;
let currentSuccessfulConnectCount = 0;

function t(key, fallback = "") {
  return chrome.i18n.getMessage(key) || fallback;
}

function setProtectionUiVisible(visible) {
  mainUi.hidden = !visible;
  safeBrowsingDisclosure.hidden = visible;
  settingsButton.hidden = !visible;
  popupRoot.classList.toggle("disclosure-mode", !visible);
  if (!visible) {
    settingsPanel.hidden = true;
  }
  resizePopup();
}

function applyState({ enabled, state }) {
  enabledToggle.checked = enabled !== false;

  if (state === "connecting") {
    stateText.textContent = "Connecting...";
    stateMessage.textContent = "Searching for fast VPN servers ...";
    return;
  }

  if (state === "error") {
    stateText.textContent = "Connection failed";
    stateMessage.textContent = "We couldn’t find any available VPN servers right now. Please try again later.";
    return;
  }

  if (enabled !== false) {
    stateText.textContent = t("enableString", "Enabled");
    stateMessage.textContent = t(
      "enableMessage",
      "UltraSurf is protecting your connection."
    );
  } else {
    stateText.textContent = t("disableString", "Disabled");
    stateMessage.textContent = t("disableMessage", "Turn on VPN to protect your connection.");
  }
}

async function loadState() {
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  applyState(state || { enabled: false, state: "disconnect" });
}

async function setEnabled(enabled) {
  enabledToggle.disabled = true;
  try {
    await chrome.runtime.sendMessage({ user: enabled ? "connect" : "disconnect" });
    await loadState();
  } finally {
    enabledToggle.disabled = false;
  }
}

function fillStars(value = 0) {
  stars.forEach((star, index) => {
    const active = index < value;
    star.textContent = active ? "★" : "☆";
    star.classList.toggle("active", active);
  });
}

function showThankYou() {
  ratingText.hidden = false;
  reviewThankYou.hidden = false;
  resizePopup();
}

function getPromptState() {
  return {
    ratingGiven: localStorage["ratingGiven"] || "",
    ratingsPageOpened: localStorage["ratingsPageOpened"] || "false",
    ratingPromptCount: Number(localStorage["ratingPromptCount"] || "0"),
    lowRatingTime: Number(localStorage["lowRatingTime"] || "0"),
    lowRatingConnectCount: Number(localStorage["lowRatingConnectCount"] || "0"),
  };
}

function shouldShowReview(successfulConnectCount) {
  const {
    ratingGiven,
    ratingsPageOpened,
    ratingPromptCount,
    lowRatingTime,
    lowRatingConnectCount,
  } = getPromptState();

  if (ratingGiven === "5" || ratingsPageOpened === "true" || ratingPromptCount >= 2) {
    return false;
  }

  if (ratingPromptCount === 0) {
    return successfulConnectCount >= FIRST_PROMPT_CONNECTS;
  }

  if (ratingPromptCount === 1 && ratingGiven && ratingGiven !== "5") {
    const enoughTimePassed = Date.now() - lowRatingTime >= REPROMPT_DELAY_MS;
    const enoughExtraConnects = successfulConnectCount >= lowRatingConnectCount + REPROMPT_EXTRA_CONNECTS;
    return enoughTimePassed && enoughExtraConnects;
  }

  return false;
}

async function updateReviewVisibility() {
  const { successfulConnectCount = 0 } = await chrome.storage.local.get(["successfulConnectCount"]);
  currentSuccessfulConnectCount = Number(successfulConnectCount || 0);

  const shouldShow = shouldShowReview(currentSuccessfulConnectCount);
  reviewBox.hidden = !shouldShow;

  if (shouldShow) {
    reviewThankYou.hidden = true;
    document.getElementById("stars").hidden = false;
    ratingText.hidden = false;
    ratingText.textContent = "";
    ratingLocked = false;
    fillStars(0);
  }
}

function handleRating(value) {
  ratingLocked = true;
  fillStars(value);

  const { ratingPromptCount } = getPromptState();

  localStorage["ratingGiven"] = String(value);

  if (value === 5) {
    localStorage["ratingsPageOpened"] = "true";
    localStorage["ratingPromptCount"] = String(Math.max(ratingPromptCount, 1));
    setTimeout(() => {
      chrome.tabs.create({
        url: "https://chrome.google.com/webstore/detail/ultrasurf/mjnbclmflcpookeapghfhapeffmpodij/reviews",
      });
    }, 200);
    updateReviewVisibility().catch(() => {});
    return;
  }

  const nextPromptCount = Math.min(ratingPromptCount + 1, 2);
  localStorage["ratingPromptCount"] = String(nextPromptCount);
  localStorage["lowRatingTime"] = String(Date.now());
  localStorage["lowRatingConnectCount"] = String(currentSuccessfulConnectCount);

  ratingText.textContent = RATING_LABELS[value] || "";
  showThankYou();
}

function toggleSettingsPanel() {
  if (settingsButton.hidden) return;
  settingsPanel.hidden = !settingsPanel.hidden;
  resizePopup();
}

async function loadDisclosureState() {
  const { [SAFE_BROWSING_DISCLOSURE_KEY]: shown } = await chrome.storage.local.get([
    SAFE_BROWSING_DISCLOSURE_KEY,
  ]);

  const disclosureShown = shown === true;
  setProtectionUiVisible(disclosureShown);
  return disclosureShown;
}

async function acknowledgeDisclosure() {
  safeBrowsingDisclosureAccept.disabled = true;
  try {
    await chrome.storage.local.set({
      [SAFE_BROWSING_DISCLOSURE_KEY]: true,
      safeBrowsingEnabled: true,
    });
    setProtectionUiVisible(true);
    safeBrowsingToggle.checked = true;
    enabledToggle.checked = true;
    stateText.textContent = "Connecting...";
    stateMessage.textContent = "Searching for fast VPN servers ...";
    await chrome.runtime.sendMessage({ user: "connect" });
    await loadState();
    await updateReviewVisibility();
  } finally {
    safeBrowsingDisclosureAccept.disabled = false;
  }
}

async function loadSafeBrowsingSetting() {
  const { safeBrowsingEnabled } = await chrome.storage.local.get([
    "safeBrowsingEnabled",
  ]);
  safeBrowsingToggle.checked = safeBrowsingEnabled !== false;
}

enabledToggle.addEventListener("change", () => {
  setEnabled(enabledToggle.checked);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.enabled || changes.state) {
    loadState().catch(() => {});
  }

  if (changes.safeBrowsingEnabled) {
    safeBrowsingToggle.checked = changes.safeBrowsingEnabled.newValue !== false;
  }

  if (changes.safeBrowsingDisclosureShown) {
    const shown = changes.safeBrowsingDisclosureShown.newValue === true;
    setProtectionUiVisible(shown);
  }

  if (changes.successfulConnectCount && !mainUi.hidden) {
    updateReviewVisibility().catch(() => {});
  }
});

stars.forEach((star) => {
  const value = Number(star.dataset.value);

  star.addEventListener("mouseenter", () => {
    if (ratingLocked) return;
    fillStars(value);
    ratingText.textContent = RATING_LABELS[value] || "";
  });

  star.addEventListener("click", () => {
    handleRating(value);
  });
});

document.getElementById("stars").addEventListener("mouseleave", () => {
  if (ratingLocked) return;
  fillStars(0);
  ratingText.textContent = "";
});

settingsButton.addEventListener("click", toggleSettingsPanel);
safeBrowsingDisclosureAccept.addEventListener("click", () => {
  acknowledgeDisclosure().catch(() => {});
});

safeBrowsingToggle.addEventListener("change", async () => {
  if (!safeBrowsingToggle.checked) {
    const confirmed = window.confirm(
      "Turn off protection?\n\nYou may no longer be warned about phishing or dangerous sites."
    );

    if (!confirmed) {
      safeBrowsingToggle.checked = true;
      return;
    }
  }

  await chrome.storage.local.set({
    safeBrowsingEnabled: safeBrowsingToggle.checked,
  });
});

title.textContent = "UltraSurf";
subtitle.textContent = t(
  "headerFeedbackMessage",
  "Security, Privacy & Freedom VPN"
);
modeLabel.textContent = t("connectedTitle", "Status");
reviewTitle.textContent = t(
  "feedbackRequestMessage",
  "Enjoying UltraSurf? Please rate us."
);

window.addEventListener("load", resizePopup);

Promise.all([
  loadState(),
  loadSafeBrowsingSetting(),
  loadDisclosureState(),
]).then(async ([, , disclosureShown]) => {
  if (disclosureShown) {
    await updateReviewVisibility();
  }
  resizePopup();
}).catch(() => {
  resizePopup();
});
