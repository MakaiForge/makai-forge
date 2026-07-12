(function () {
  if (sessionStorage.getItem('ultraWelcomeShown')) return;
  sessionStorage.setItem('ultraWelcomeShown', '1');

  function t(key) {
    try { return chrome.i18n.getMessage(key); } catch { return key; }
  }

  const SECONDS = 10;
  let remaining = SECONDS;

  const overlay = document.createElement('div');
  overlay.id = 'ultra-welcome-overlay';
  overlay.innerHTML = `
    <style>
      #ultra-welcome-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(6px);
        animation: uwFadeIn 0.4s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      @keyframes uwFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes uwSlideUp {
        from { opacity: 0; transform: translateY(24px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes uwShrink {
        from { width: 100%; }
        to { width: 0%; }
      }
      .uw-card {
        background: #1a1a2e;
        border: 1px solid rgba(74,158,255,0.25);
        border-radius: 20px;
        padding: 40px;
        max-width: 480px;
        width: 90%;
        text-align: center;
        box-shadow: 0 24px 80px rgba(0,0,0,0.5);
        animation: uwSlideUp 0.5s ease-out;
        position: relative;
      }
      .uw-logo {
        width: 64px;
        height: 64px;
        background: linear-gradient(135deg, #4a9eff, #6c5ce7);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        font-size: 28px;
        font-weight: 800;
        color: #fff;
      }
      .uw-title {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 4px;
        color: #fff;
      }
      .uw-subtitle {
        font-size: 12px;
        color: #888;
        margin-bottom: 24px;
      }
      .uw-message {
        font-size: 15px;
        line-height: 1.7;
        color: #ccc;
        text-align: left;
        padding: 18px;
        background: rgba(0,0,0,0.3);
        border-radius: 10px;
        border-left: 3px solid #4a9eff;
        margin-bottom: 24px;
      }
      .uw-timer-bar {
        width: 100%;
        height: 4px;
        background: rgba(255,255,255,0.08);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 12px;
      }
      .uw-timer-fill {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #4a9eff, #6c5ce7);
        border-radius: 2px;
        animation: uwShrink ${SECONDS}s linear forwards;
      }
      .uw-timer-text {
        font-size: 11px;
        color: #666;
        margin-bottom: 16px;
      }
      .uw-btn {
        background: linear-gradient(135deg, #4a9eff, #6c5ce7);
        color: #fff;
        border: none;
        padding: 11px 36px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .uw-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(74,158,255,0.35);
      }
      .uw-btn:active { transform: scale(0.97); }
    </style>
    <div class="uw-card">
      <div class="uw-logo">U</div>
      <div class="uw-title">${t('appName')}</div>
      <div class="uw-subtitle">${t('subtitle')}</div>
      <div class="uw-message">${t('message')}</div>
      <div class="uw-timer-bar"><div class="uw-timer-fill"></div></div>
      <div class="uw-timer-text">${t('closeIn')} ${remaining}s</div>
      <button class="uw-btn">${t('btn')}</button>
    </div>
  `;

  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  const timerText = overlay.querySelector('.uw-timer-text');
  const btn = overlay.querySelector('.uw-btn');

  function removeOverlay() {
    document.documentElement.style.overflow = '';
    overlay.remove();
  }

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      removeOverlay();
    } else {
      timerText.textContent = `${t('closeIn')} ${remaining}s`;
    }
  }, 1000);

  btn.addEventListener('click', () => {
    clearInterval(interval);
    removeOverlay();
  });
})();
