const params = new URLSearchParams(window.location.search);
const target = params.get("target") || "";

document.getElementById("targetUrl").textContent = target;

document.getElementById("backBtn").addEventListener("click", async () => {
  try {
    await chrome.tabs.getCurrent(async (tab) => {
      if (tab?.id) {
        try {
          await chrome.tabs.goBack(tab.id);
          return;
        } catch {}
      }
      window.history.back();
    });
  } catch {
    window.history.back();
  }
});

document.getElementById("continueBtn").addEventListener("click", async () => {
  if (!target) return;

  try {
    await chrome.runtime.sendMessage({
      type: "safeBrowsingProceed",
      target,
    });
  } catch {}

  window.location.href = target;
});
