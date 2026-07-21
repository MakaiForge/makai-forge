import { ipcMain, app } from "electron";
import { ChromeManager } from "@main/services/chrome-browser";
import { runSetup, loadConfig } from "@main/services/chrome-browser/setup";
import { WindowManager } from "@main/services/window-manager";
import path from "node:path";
import fs from "node:fs";

let chromeManager: ChromeManager | null = null;

export function setChromeManager(cm: ChromeManager | null): void {
  chromeManager = cm;
}

export function getChromeManager(): ChromeManager | null {
  return chromeManager;
}

function sendToMainWindow(channel: string, ...args: any[]): void {
  if (WindowManager.mainWindow && !WindowManager.mainWindow.isDestroyed()) {
    WindowManager.mainWindow.webContents.send(channel, ...args);
  }
}

export function registerChromeBrowserEvents(): void {
  ipcMain.handle("chrome-navigate", async (_event, tabId: string, url: string) => {
    if (!chromeManager) return { success: false, error: "Chrome não iniciado" };
    try {
      const resultUrl = await chromeManager.navigate(tabId, url);
      return { success: true, url: resultUrl };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("chrome-new-tab", async (_event, url?: string) => {
    if (!chromeManager) return { success: false, error: "Chrome não iniciado" };
    try {
      const tabId = await chromeManager.newTab(url || "about:blank");
      return { success: true, tabId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("chrome-close-tab", async (_event, tabId: string) => {
    if (!chromeManager) return { success: false, error: "Chrome não iniciado" };
    try {
      await chromeManager.closeTab(tabId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("chrome-switch-tab", async (_event, tabId: string) => {
    if (!chromeManager) return { success: false, error: "Chrome não iniciado" };
    try {
      const ok = await chromeManager.switchTab(tabId);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("chrome-get-tabs", async () => {
    return chromeManager ? chromeManager.getTabs() : [];
  });

  ipcMain.handle("chrome-get-active-tab", async () => {
    return chromeManager ? chromeManager.activeTabId : null;
  });

  ipcMain.handle("chrome-set-zoom", async (_event, tabId: string, factor: number) => {
    if (!chromeManager) return;
    await chromeManager.setZoom(tabId, factor);
    return { success: true };
  });

  ipcMain.handle("chrome-get-zoom", async (_event, tabId: string) => {
    if (!chromeManager) return { factor: 1 };
    const factor = chromeManager.getZoom(tabId);
    return { factor };
  });

  ipcMain.handle("chrome-set-page-muted", async (_event, tabId: string, muted: boolean) => {
    if (!chromeManager) return;
    await chromeManager.setPageMuted(tabId, muted);
    return { success: true };
  });

  ipcMain.handle("chrome-is-page-muted", async (_event, tabId: string) => {
    if (!chromeManager) return { muted: false };
    const muted = chromeManager.isPageMuted(tabId);
    return { muted };
  });

  ipcMain.handle("chrome-navigate-back", async (_event, tabId: string) => {
    if (!chromeManager) return;
    await chromeManager.navigateBack(tabId);
  });

  ipcMain.handle("chrome-navigate-forward", async (_event, tabId: string) => {
    if (!chromeManager) return;
    await chromeManager.navigateForward(tabId);
  });

  ipcMain.handle("chrome-get-nav-history", async (_event, tabId: string) => {
    if (!chromeManager) return { canGoBack: false, canGoForward: false };
    return await chromeManager.getNavigationHistory(tabId);
  });

  ipcMain.on("chrome-user-input", async (_event, data: any) => {
    if (!chromeManager || !chromeManager.activeTabId) return;
    const tabId = data.tabId || chromeManager.activeTabId;

    switch (data.type) {
      case "mousedown": {
        await chromeManager.dispatchMouseEvent(tabId, "mousePressed", data.x, data.y, data.button || "left", data.clickCount || 1);
        break;
      }
      case "mouseup": {
        await chromeManager.dispatchMouseEvent(tabId, "mouseReleased", data.x, data.y, data.button || "left", data.clickCount || 1);
        break;
      }
      case "mousemove": {
        await chromeManager.dispatchMouseEvent(tabId, "mouseMoved", data.x, data.y, "none", 0);
        break;
      }
      case "wheel": {
        await chromeManager.dispatchMouseEvent(tabId, "mouseWheel", data.x, data.y, "none", 0, {
          deltaX: data.deltaX || 0,
          deltaY: data.deltaY || 0,
        });
        break;
      }
      case "keydown": {
        const opts: Record<string, unknown> = {};
        if (data.key) opts.key = data.key;
        if (data.code) opts.code = data.code;
        if (data.keyCode !== undefined) opts.windowsVirtualKeyCode = data.keyCode;
        if (data.text) opts.text = data.text;
        if (data.modifiers) opts.modifiers = data.modifiers;
        if (data.autoRepeat) opts.autoRepeat = true;
        await chromeManager.dispatchKeyEvent(tabId, "rawKeyDown", opts);
        if (data.key && data.key.length === 1 && !data.autoRepeat) {
          await chromeManager.dispatchKeyEvent(tabId, "char", {
            key: data.key,
            text: data.key,
            unmodifiedText: data.key,
          });
        }
        break;
      }
      case "keyup": {
        const opts: Record<string, unknown> = {};
        if (data.key) opts.key = data.key;
        if (data.code) opts.code = data.code;
        if (data.keyCode !== undefined) opts.windowsVirtualKeyCode = data.keyCode;
        if (data.modifiers) opts.modifiers = data.modifiers;
        await chromeManager.dispatchKeyEvent(tabId, "rawKeyUp", opts);
        break;
      }
      case "paste": {
        await chromeManager.insertText(tabId, data.text);
        break;
      }
    }
  });

  ipcMain.on("chrome-resize-viewport", async (_event, { width, height }: { width: number; height: number }) => {
    if (!chromeManager) return;
    await chromeManager.resizeViewport(width, height).catch(() => {});
  });

  ipcMain.handle("chrome-open-devtools", async (_event, tabId: string) => {
    if (!chromeManager) return;
    await chromeManager.openDevTools(tabId);
  });

  ipcMain.handle("chrome-get-browser-status", async () => {
    return {
      running: chromeManager !== null && chromeManager.browser !== null,
      tabsCount: chromeManager?.pages.size ?? 0,
      activeTabId: chromeManager?.activeTabId ?? null,
    };
  });

  ipcMain.handle("chrome-setup-and-launch", async (_event, mirrorId?: string) => {
    try {
      if (chromeManager) {
        await chromeManager.close();
        setChromeManager(null);
      }

      let config = loadConfig();
      const needsSetup = !config || !fs.existsSync(config.chromePath);

      if (needsSetup) {
        sendToMainWindow("chrome-setup-progress", {
          status: "Iniciando setup...",
          progress: 0,
        });

        config = await runSetup((progress) => {
          sendToMainWindow("chrome-setup-progress", progress);
        });
      }

      const cm = new ChromeManager();
      if (mirrorId) cm.mirrorId = mirrorId;
      setChromeManager(cm);

      cm.onScreencastFrame((frame) => {
        console.log("[chrome-events] onScreencastFrame called, dataLen:", frame.data?.length);
        sendToMainWindow("chrome-screencast-frame", frame);
      });

      cm.onTabListChange((tabs) => {
        sendToMainWindow("chrome-tab-list", tabs);
      });

      cm.onNavigation((tabId, url) => {
        sendToMainWindow("chrome-navigation", { tabId, url });
      });

      await cm.launch({ chromePath: config!.chromePath, extensionPath: config!.extensionPath || undefined });
      return { success: true, tabsCount: cm.pages.size };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("chrome-close", async () => {
    if (chromeManager) {
      await chromeManager.close();
      setChromeManager(null);
    }
    return { success: true };
  });

  // Find in page
  ipcMain.handle("chrome-find-in-page", async (_event, tabId: string, query: string, forward: boolean) => {
    if (!chromeManager) return { found: false };
    const found = await chromeManager.findInPage(tabId, query, forward);
    return { found };
  });

  ipcMain.handle("chrome-count-matches", async (_event, tabId: string, query: string) => {
    if (!chromeManager) return { count: 0 };
    const count = await chromeManager.countMatches(tabId, query);
    return { count };
  });

  ipcMain.handle("chrome-clear-find", async (_event, tabId: string) => {
    if (!chromeManager) return;
    await chromeManager.clearFind(tabId);
  });

  // Bookmarks
  const bookmarksPath = path.join(app.getAppPath(), "app", "_data", "bookmarks.json");

  function loadBookmarks(): Array<{ url: string; title: string }> {
    try {
      if (fs.existsSync(bookmarksPath)) {
        return JSON.parse(fs.readFileSync(bookmarksPath, "utf-8"));
      }
    } catch { /* ignore */ }
    return [
      { url: "https://www.nexusmods.com", title: "Nexus Mods" },
      { url: "https://gamebanana.com", title: "GameBanana" },
      { url: "https://www.moddb.com", title: "Mod DB" },
      { url: "https://www.curseforge.com", title: "CurseForge" },
      { url: "https://mod.io", title: "Mod.io" },
      { url: "https://thunderstore.io", title: "Thunderstore" },
      { url: "https://itch.io", title: "Itch.io" },
      { url: "https://www.loverslab.com", title: "LoversLab" },
    ];
  }

  function saveBookmarks(bookmarks: Array<{ url: string; title: string }>): void {
    try {
      fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
    } catch { /* ignore */ }
  }

  function emitBookmarksChanged(): void {
    sendToMainWindow("chrome-bookmarks-changed", loadBookmarks());
  }

  ipcMain.handle("chrome-get-bookmarks", async () => {
    return loadBookmarks();
  });

  ipcMain.handle("chrome-add-bookmark", async (_event, url: string, title: string) => {
    const bookmarks = loadBookmarks();
    if (!bookmarks.find((b) => b.url === url)) {
      bookmarks.push({ url, title });
      saveBookmarks(bookmarks);
      emitBookmarksChanged();
    }
    return { success: true };
  });

  ipcMain.handle("chrome-remove-bookmark", async (_event, url: string) => {
    let bookmarks = loadBookmarks();
    bookmarks = bookmarks.filter((b) => b.url !== url);
    saveBookmarks(bookmarks);
    emitBookmarksChanged();
    return { success: true };
  });

  // Extensions
  ipcMain.handle("chrome-get-extensions", async () => {
    try {
      const extDir = path.join(app.getAppPath(), "app", "_resources", "extensions");
      if (!fs.existsSync(extDir)) return [];
      const entries = fs.readdirSync(extDir);
      const exts: Array<{ id: string; name: string; icon: string }> = [];
      for (const entry of entries) {
        const manifestPath = path.join(extDir, entry, "manifest.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          const icons = manifest.icons || {};
          const sizes = Object.keys(icons).map(Number).sort((a, b) => a - b);
          let iconData = "";
          if (sizes.length > 0) {
            const iconFile = icons[sizes[0]];
            const iconFullPath = path.join(extDir, entry, iconFile);
            if (fs.existsSync(iconFullPath)) {
              const ext = path.extname(iconFile).toLowerCase();
              const mime = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
              iconData = `data:${mime};base64,${fs.readFileSync(iconFullPath).toString("base64")}`;
            }
          }
          exts.push({ id: entry, name: manifest.name || entry, icon: iconData });
        }
      }
      return exts;
    } catch { return []; }
  });

  ipcMain.handle("chrome-get-extension-state", async () => {
    if (!chromeManager) return { enabled: false, state: "disconnect" };
    return await chromeManager.getExtensionState();
  });

  ipcMain.handle("chrome-toggle-extension", async (_event, enabled: boolean) => {
    if (!chromeManager) return { success: false };
    await chromeManager.toggleExtension(enabled);
    return { success: true };
  });
}
