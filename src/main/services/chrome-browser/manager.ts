import { app } from "electron";
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import type { Browser, BrowserContext, Page } from "playwright-core";

const EXT_ID = "mjnbclmflcpookeapghfhapeffmpodij";

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
  audible: boolean;
}

export interface ScreencastFrame {
  data: string | Uint8Array;
  sessionId: number;
  metadata?: Record<string, unknown>;
  tabId: string;
  mirrorId?: string;
}

export interface ChromeConfig {
  chromePath?: string;
  extensionPath?: string;
  profilePath?: string;
  windowWidth?: number;
  windowHeight?: number;
  chrome?: {
    disableGpu?: boolean;
    disableFontHinting?: boolean;
    disableFontSubpixelPositioning?: boolean;
    extraFlags?: string[];
  };
}

function detectLocale(): string {
  try {
    const envLang = process.env.LANG || "";
    if (envLang) {
      const locale = envLang.split(".")[0].replace("_", "-");
      if (locale) return locale;
    }
    return "en-US";
  } catch {
    return "en-US";
  }
}

function findExtensions(): string[] {
  const extDir = path.join(app.getAppPath(), "app", "_resources", "extensions");
  const result: string[] = [];
  try {
    const entries = fs.readdirSync(extDir);
    for (const entry of entries) {
      const manifestPath = path.join(extDir, entry, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        result.push(path.join(extDir, entry));
      }
    }
  } catch { /* ignore */ }
  return result;
}

export class ChromeManager {
  mirrorId = "";
  process: import("node:child_process").ChildProcess | null = null;
  browser: Browser | null = null;
  context: BrowserContext | null = null;
  pages: Map<string, { page: Page; session: any }> = new Map();
  activeTabId: string | null = null;
  _onScreencastFrame: ((frame: ScreencastFrame) => void) | null = null;
  _onTabListChange: ((tabs: TabInfo[]) => void) | null = null;
  _onNavigation: ((tabId: string, url: string) => void) | null = null;
  _onNewTab: ((tabId: string) => void) | null = null;
  _debugPort = 0;
  _zoomFactors = new Map<string, number>();
  _mutedTabs = new Set<string>();
  _lastViewport: { width: number; height: number } | null = null;
  _pendingPages: Map<Page, string> | null = null;
  _extensionPath: string | null = null;
  _screencastPolling = new Map<string, ReturnType<typeof setInterval>>();
  _screencastTab: string | null = null;

  private static _tabCounter = 0;

  onScreencastFrame(cb: (frame: ScreencastFrame) => void): void { this._onScreencastFrame = cb; }
  onTabListChange(cb: (tabs: TabInfo[]) => void): void { this._onTabListChange = cb; }
  onNavigation(cb: (tabId: string, url: string) => void): void { this._onNavigation = cb; }
  onNewTab(cb: (tabId: string) => void): void { this._onNewTab = cb; }

  async openDevTools(tabId: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    try {
      const targets: any[] = await this._fetchJSON(`http://127.0.0.1:${this._debugPort}/json`) as any[];
      const target = targets.find(t => t.id === tabId);
      if (target?.webSocketDebuggerUrl) {
        const devtoolsUrl = `devtools://devtools/bundled/inspector.html?ws=${encodeURIComponent(target.webSocketDebuggerUrl)}`;
        await this.newTab(devtoolsUrl);
      }
    } catch { /* ignore */ }
  }

  async launch(userConfig: ChromeConfig = {}): Promise<number> {
    const chromePath = userConfig.chromePath || this._findChrome();
    this._killOurChrome();
    if (!chromePath) throw new Error("Chrome não encontrado");

    this._extensionPath = userConfig.extensionPath || null;

    const isVisible = process.env.CHROME_VISIBLE === "1";

    const profilesDir = app.isPackaged
      ? path.join(process.resourcesPath, "app", "_data", ".chrome-profiles")
      : path.join(app.getAppPath(), "app", "_data", ".chrome-profiles");
    const userDataDir = userConfig.profilePath
      ? path.resolve(userConfig.profilePath)
      : path.join(profilesDir, `profile-${Date.now()}`);

    fs.mkdirSync(userDataDir, { recursive: true });
    this._clearSession(userDataDir);
    this._debugPort = await this._findFreePort();

    const args = [
      `--remote-debugging-port=${this._debugPort}`,
      `--user-data-dir=${userDataDir}`,
      ...(isVisible ? [] : ["--headless=new"]),
      "--disable-blink-features=AutomationControlled",
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--no-pings",
      "--disable-translate",
      "--disable-popup-blocking",
      "--no-sandbox",
      ...(isVisible ? [] : ["--no-startup-window"]),
      "--disable-features=TranslateUI,ChromeWhatsNewUI,PrivacySandboxSettings4",
      `--lang=${detectLocale()}`,
    ];

    const chromeCfg = userConfig.chrome || {};
    if (chromeCfg.disableGpu) args.push("--disable-gpu");
    if (chromeCfg.disableFontHinting) args.push("--disable-font-subpixel-positioning");
    if (chromeCfg.disableFontSubpixelPositioning) args.push("--disable-lcd-text");
    if (chromeCfg.extraFlags) args.push(...chromeCfg.extraFlags);

    const allExts: string[] = [];
    if (this._extensionPath && fs.existsSync(this._extensionPath)) {
      allExts.push(this._extensionPath);
    }
    const autoExts = findExtensions();
    for (const ext of autoExts) {
      if (!allExts.includes(ext)) {
        allExts.push(ext);
      }
    }
    if (allExts.length > 0) {
      args.push(`--load-extension=${allExts.join(",")}`);
    }

    this.process = spawn(chromePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    });
    this.process.stderr?.on("data", () => { /* ignore */ });
    this.process.on("exit", (code) => {
      console.log(`Chrome encerrou (código ${code})`);
    });

    await this._waitForChrome();
    await this._connectPlaywright();
    await this._ensureExtension();
    await this._setupTabs();
    console.log(`Chrome OK. ${this.pages.size} aba(s).`);
    return this.pages.size;
  }

  async close(): Promise<void> {
    await this._stopActiveScreencast();
    this.pages.clear();
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
    }
    if (this.process?.pid) {
      try {
        process.kill(-this.process.pid, "SIGKILL");
      } catch { /* ignore */ }
      this.process = null;
    }
    this._killOurChrome();
  }

  private async _ensureExtension(): Promise<void> {
    try {
      const targets: any[] = await this._fetchJSON(`http://127.0.0.1:${this._debugPort}/json`) as any[];
      const found = targets.some((t: any) => t.url && t.url.includes(`chrome-extension://${EXT_ID}`));
      if (found) return;
    } catch { /* ignore */ }

    try {
      if (!this.context) return;
      const page = await this.context.newPage();
      const session = await this.context!.newCDPSession(page);
      await session.send("Page.enable").catch(() => {});
      await session.send("Page.navigate", {
        url: `chrome-extension://${EXT_ID}/ui/popup.html`,
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
      await page.close().catch(() => {});
    } catch { /* ignore */ }
  }

  private async _waitForChrome(timeout = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await this._fetchJSON(`http://127.0.0.1:${this._debugPort}/json/version`);
        return;
      } catch {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    throw new Error("Chrome não iniciou a tempo");
  }

  private async _connectPlaywright(): Promise<void> {
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this._debugPort}`);
    const ctxs = this.browser.contexts();
    this.context = ctxs[0] || (await this.browser.newContext());
  }

  private async _setupTabs(): Promise<void> {
    if (!this.context) return;

    this.context.on("page", async (page) => {
      const existingId = this._getPageId(page);
      if (!existingId) {
        const tabId = await this._addPage(page);
        this._onNewTab?.(tabId);
        this._notifyTabList();
      }
    });

    let pages = this.context.pages();
    if (pages.length === 0) {
      const page = await this.context.newPage();
      await page.goto("about:blank");
      pages = [page];
    }

    for (const page of pages) {
      if (!this._getPageId(page)) {
        await this._addPage(page);
      }
    }

    if (this.pages.size > 0) {
      this.activeTabId = [...this.pages.keys()][0];
      await this._startActiveScreencast();
      this._notifyTabList();
    }

    if (this.activeTabId) {
      const tab = this.pages.get(this.activeTabId);
      if (tab) {
        tab.session.send("Page.navigate", { url: "https://www.nexusmods.com/" }).catch(() => {});
      }
    }
  }

  private _getPageId(page: Page): string | null {
    for (const [id, t] of this.pages) {
      if (t.page === page) return id;
    }
    return null;
  }

  private async _addPage(page: Page): Promise<string> {
    if (this._pendingPages) {
      const pending = this._pendingPages.get(page);
      if (pending) return pending;
    } else {
      this._pendingPages = new Map();
    }

    const existingId = this._getPageId(page);
    if (existingId) return existingId;

    const tabId = `tab_${++ChromeManager._tabCounter}`;
    this._pendingPages.set(page, tabId);

    let session: any;
    try {
      session = await this.context!.newCDPSession(page);
    } catch (e) {
      this._pendingPages.delete(page);
      throw e;
    }

    this.pages.set(tabId, { page, session });
    this._pendingPages.delete(page);

    if (this._lastViewport) {
      session.send("Page.setDeviceMetricsOverride", {
        width: Math.round(this._lastViewport.width),
        height: Math.round(this._lastViewport.height),
        deviceScaleFactor: 1,
        mobile: false,
      }).catch(() => { /* ignore */ });
    }

    page.on("close", () => {
      this.pages.delete(tabId);
      if (this.activeTabId === tabId) {
        this.activeTabId = this.pages.size > 0 ? [...this.pages.keys()][0] : null;
        if (this.activeTabId) this._startActiveScreencast();
      }
      this._notifyTabList();
    });

    session.on("Page.frameNavigated", (params: { frame: { url: string } }) => {
      if (this.activeTabId === tabId && this._onNavigation) {
        this._onNavigation(tabId, params.frame.url);
      }
      this._notifyTabList();
    });

    session.on("Page.navigatedWithinDocument", (params: { url: string }) => {
      if (this.activeTabId === tabId && this._onNavigation) {
        this._onNavigation(tabId, params.url);
      }
    });

    session.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
      if (this.activeTabId === tabId && this._onScreencastFrame) {
        this._onScreencastFrame({ data: frame.data, sessionId: frame.sessionId, tabId, mirrorId: this.mirrorId });
        session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      }
    });

    try { await session.send("Page.enable"); } catch { /* ignore */ }

    this._onNewTab?.(tabId);
    return tabId;
  }

  async newTab(url = "about:blank"): Promise<string | null> {
    if (!this.context) return null;
    const page = await this.context.newPage();
    let tabId = this._getPageId(page);
    if (!tabId) {
      tabId = await this._addPage(page);
    }
    if (url && url !== "about:blank") {
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { /* ignore */ });
    }
    this.activeTabId = tabId;
    await this._startActiveScreencast();
    this._notifyTabList();
    return tabId;
  }

  async closeTab(tabId: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab || this.pages.size <= 1) return;
    try { await tab.page.close(); } catch { /* ignore */ }
    this.pages.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = this.pages.size > 0 ? [...this.pages.keys()][0] : null;
      if (this.activeTabId) await this._startActiveScreencast();
    }
    this._notifyTabList();
  }

  async switchTab(tabId: string): Promise<boolean> {
    if (!this.pages.has(tabId)) return false;
    this.activeTabId = tabId;
    await this._startActiveScreencast();
    this._notifyTabList();
    return true;
  }

  getTabs(): TabInfo[] {
    return [...this.pages.entries()].map(([id, tab]) => ({
      id,
      url: tab.page.url(),
      title: tab.page.url() || "Nova aba",
      active: id === this.activeTabId,
      audible: !this._mutedTabs.has(id),
    }));
  }

  private _notifyTabList(): void {
    this._onTabListChange?.(this.getTabs());
  }

  private async _captureScreencastFrame(tabId: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) { console.warn("[screencast] tab not found:", tabId); return; }
    if (this.activeTabId !== tabId) return;
    if (!this._onScreencastFrame) { console.warn("[screencast] no callback"); return; }
    try {
      const buf = await tab.page.screenshot({ type: "jpeg", quality: 60 });
      this._onScreencastFrame({
        data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
        sessionId: 0,
        tabId,
        mirrorId: this.mirrorId,
      });
    } catch (e: any) {
      console.warn("[screencast] error:", e.message);
    }
  }

  private _stopScreencastPolling(tabId?: string): void {
    if (tabId) {
      const existing = this._screencastPolling.get(tabId);
      if (existing) { clearInterval(existing); this._screencastPolling.delete(tabId); }
    } else {
      for (const [tid, interval] of this._screencastPolling) {
        clearInterval(interval);
        this._screencastPolling.delete(tid);
      }
    }
  }

  private async _stopActiveScreencast(): Promise<void> {
    if (this._screencastTab && this._screencastTab !== this.activeTabId) {
      const prevTab = this.pages.get(this._screencastTab);
      if (prevTab) {
        try { await prevTab.session.send("Page.stopScreencast"); } catch {}
      }
    }
    this._stopScreencastPolling();
    this._screencastTab = null;
  }

  private async _startActiveScreencast(): Promise<void> {
    if (!this.activeTabId) return;
    await this._stopActiveScreencast();
    const tab = this.pages.get(this.activeTabId);
    if (!tab) return;
    const tabId = this.activeTabId;

    try {
      await tab.session.send("Page.startScreencast", {
        format: "jpeg",
        quality: 80,
        maxWidth: 2560,
        maxHeight: 1440,
        everyNthFrame: 1,
      });
      this._screencastTab = tabId;
      console.log("[screencast] Page.startScreencast OK for", tabId);
    } catch (e: any) {
      // startScreencast unavailable → poll with page.screenshot
      console.warn("[screencast] Page.startScreencast failed, polling fallback:", e.message);
      this._screencastPolling.set(tabId, setInterval(() => {
        this._captureScreencastFrame(tabId);
      }, 100));
    }
  }

  async navigate(tabId: string, url: string): Promise<string> {
    const tab = this.pages.get(tabId);
    if (!tab) throw new Error("Aba não encontrada");
    let fullUrl = url.trim();
    if (/^view-source:/i.test(fullUrl)) {
      await tab.session.send("Page.navigate", { url: fullUrl }).catch(() => { /* ignore */ });
      return tab.page.url();
    }
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(fullUrl);
    if (!hasProtocol) fullUrl = "https://" + fullUrl;
    if (/^chrome:\/\//.test(fullUrl) || /^about:\/\//.test(fullUrl) || /^chrome-extension:\/\//.test(fullUrl)) {
      await tab.session.send("Page.navigate", { url: fullUrl }).catch(() => { /* ignore */ });
    } else {
      await tab.page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { /* ignore */ });
    }
    return tab.page.url();
  }

  async navigateBack(tabId: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    try {
      const hist = await tab.session.send("Page.getNavigationHistory") as { currentIndex: number; entries: { id: number }[] };
      const idx = hist.currentIndex;
      if (idx > 0) {
        await tab.session.send("Page.navigateToHistoryEntry", { entryId: hist.entries[idx - 1].id });
      }
    } catch (e: any) {
      console.warn("navigateBack error:", e.message);
    }
  }

  async navigateForward(tabId: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    try {
      const hist = await tab.session.send("Page.getNavigationHistory") as { currentIndex: number; entries: { id: number }[] };
      const idx = hist.currentIndex;
      if (idx < hist.entries.length - 1) {
        await tab.session.send("Page.navigateToHistoryEntry", { entryId: hist.entries[idx + 1].id });
      }
    } catch (e: any) {
      console.warn("navigateForward error:", e.message);
    }
  }

  async getNavigationHistory(tabId: string): Promise<{ canGoBack: boolean; canGoForward: boolean; currentIndex?: number; entries?: { id: number }[] }> {
    const tab = this.pages.get(tabId);
    if (!tab) return { canGoBack: false, canGoForward: false };
    try {
      const hist = await tab.session.send("Page.getNavigationHistory") as { currentIndex: number; entries: { id: number }[] };
      const idx = hist.currentIndex;
      return {
        canGoBack: idx > 0,
        canGoForward: idx < hist.entries.length - 1,
        currentIndex: idx,
        entries: hist.entries,
      };
    } catch {
      return { canGoBack: false, canGoForward: false };
    }
  }

  async resizeViewport(width: number, height: number): Promise<void> {
    this._lastViewport = { width, height };
    for (const [, t] of this.pages) {
      try {
        await t.session.send("Page.setDeviceMetricsOverride", {
          width: Math.round(width),
          height: Math.round(height),
          deviceScaleFactor: 1,
          mobile: false,
        });
      } catch (e: any) {
        console.warn("resizeViewport error:", e.message);
      }
    }
  }

  async setZoom(tabId: string, factor: number): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    this._zoomFactors.set(tabId, factor);
    try {
      await tab.session.send("Page.setZoomFactor", { zoomFactor: factor });
    } catch (e: any) {
      console.warn("setZoom error:", e.message);
    }
  }

  getZoom(tabId: string): number {
    return this._zoomFactors.get(tabId) || 1;
  }

  async setPageMuted(tabId: string, muted: boolean): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    if (muted) {
      this._mutedTabs.add(tabId);
    } else {
      this._mutedTabs.delete(tabId);
    }
    try {
      await tab.page.evaluate((m: boolean) => {
        document.querySelectorAll("audio,video").forEach((el) => (el as HTMLMediaElement).muted = m);
      }, muted);
    } catch { /* ignore */ }
  }

  isPageMuted(tabId: string): boolean {
    return this._mutedTabs.has(tabId);
  }

  async dispatchMouseEvent(tabId: string, type: string, x: number, y: number, button = "left", clickCount = 1, extra: Record<string, unknown> = {}): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    await tab.session.send("Input.dispatchMouseEvent", { type, x, y, button, clickCount, ...extra }).catch(() => { /* ignore */ });
  }

  async dispatchKeyEvent(tabId: string, type: string, opts: Record<string, unknown> = {}): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    await tab.session.send("Input.dispatchKeyEvent", { type, ...opts }).catch(() => { /* ignore */ });
  }

  async insertText(tabId: string, text: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    await tab.session.send("Input.insertText", { text }).catch(() => { /* ignore */ });
  }

  async findInPage(tabId: string, query: string, forward = true): Promise<boolean> {
    const tab = this.pages.get(tabId);
    if (!tab) return false;
    try {
      const backwards = forward ? "false" : "true";
      const result = await tab.session.send("Runtime.evaluate", {
        expression: `window.find(${JSON.stringify(query)}, false, ${backwards}, true, false, true)`,
      });
      return result?.result?.value === true;
    } catch { return false; }
  }

  async countMatches(tabId: string, query: string): Promise<number> {
    const tab = this.pages.get(tabId);
    if (!tab) return 0;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const result = await tab.session.send("Runtime.evaluate", {
        expression: `(document.body.innerText.match(new RegExp(${JSON.stringify(escaped)}, 'gi')) || []).length`,
      });
      return result?.result?.value ?? 0;
    } catch { return 0; }
  }

  async clearFind(tabId: string): Promise<void> {
    const tab = this.pages.get(tabId);
    if (!tab) return;
    try {
      await tab.session.send("Runtime.evaluate", {
        expression: "window.getSelection().removeAllRanges()",
      });
    } catch { /* ignore */ }
  }

  async getExtensionState(): Promise<{ enabled: boolean; state: string }> {
    return (await this._withPopup(async (page) => {
      try {
        const result = await page.evaluate(() => {
          const toggle = document.getElementById("enabledToggle") as HTMLInputElement | null;
          const stateText = document.getElementById("stateText");
          return {
            enabled: toggle ? toggle.checked : false,
            state: stateText ? stateText.textContent?.trim() || "" : "",
          };
        });
        return result;
      } catch {
        return { enabled: false, state: "disconnect" };
      }
    })) || { enabled: false, state: "disconnect" };
  }

  async toggleExtension(enabled: boolean): Promise<void> {
    await this._withPopup(async (page) => {
      try {
        await page.evaluate((enabled: boolean) => {
          const toggle = document.getElementById("enabledToggle") as HTMLInputElement | null;
          if (toggle) {
            toggle.checked = enabled;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, enabled);
      } catch { /* ignore */ }
    });
  }

  private async _withPopup<T>(fn: (page: Page) => Promise<T>): Promise<T | null> {
    if (!this.context) return null;
    const page = await this.context.newPage();
    const session = await this.context!.newCDPSession(page);
    try {
      await session.send("Page.enable").catch(() => {});
      await session.send("Page.navigate", {
        url: `chrome-extension://${EXT_ID}/ui/popup.html`,
      }).catch(() => {});
      await page.evaluate(() => new Promise<void>((resolve) => {
        let attempts = 0;
        const check = () => {
          const toggle = document.getElementById("enabledToggle");
          const state = document.getElementById("stateText");
          if (toggle && state && state.textContent?.trim()) {
            resolve();
          } else if (++attempts < 30) {
            setTimeout(check, 200);
          } else {
            resolve();
          }
        };
        check();
      }));
      return await fn(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  private _killOurChrome(): void {
    try {
      execSync(`pkill -9 -f "chrome.*--remote-debugging-port=${this._debugPort}" 2>/dev/null`, { stdio: "ignore" });
    } catch { /* ignore */ }
  }

  private async _fetchJSON(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      }).on("error", reject);
    });
  }

  private async _findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as net.AddressInfo).port;
        s.close(() => resolve(p));
      });
      s.on("error", reject);
    });
  }

  private _findChrome(): string | null {
    const candidates = [
      process.env.CHROME_PATH,
      // Chrome embarcado do app (não usar __dirname — quebra no bundle out/main)
      path.join(app.getAppPath(), "app", "_resources", "chrome", "chrome-linux64", "chrome"),
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    return null;
  }

  private _clearSession(profilePath: string): void {
    const files = ["Current Session", "Current Tabs", "Last Session", "Last Tabs"];
    for (const f of files) {
      try { fs.unlinkSync(path.join(profilePath, f)); } catch { /* ignore */ }
    }
    const sessionsDir = path.join(profilePath, "Sessions");
    if (fs.existsSync(sessionsDir)) {
      try { fs.rmSync(sessionsDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
