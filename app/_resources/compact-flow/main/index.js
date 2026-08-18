// CompactFlow — processamento principal (standalone)
// App complementar do Makai Forge: verifica compatibilidade de .exe/.msi com Linux.
// Consome os dados do Makai Forge em ~/.config/makai-forger/resources (ver data.js).
const { app, BrowserWindow, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const state = require("./state");

const WINDOW_WIDTH = 520;
const WINDOW_HEIGHT = 440;

// ── IPC handlers (registram-se sozinhos no require) ──────────────────────────
require("./ipc/analyze");
require("./ipc/catalog");
require("./ipc/proton");
require("./ipc/install");
require("./ipc/icon");
require("./ipc/logger");

function isExeArg(arg) {
  return typeof arg === "string" && /\.(exe|msi)$/i.test(arg) && !arg.startsWith("-");
}

function createWindow() {
  if (state.win && !state.win.isDestroyed()) {
    state.win.focus();
    return state.win;
  }

  const display = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = display.bounds;

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round((displayWidth - WINDOW_WIDTH) / 2),
    y: Math.round((displayHeight - WINDOW_HEIGHT) / 2),
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => state.setCompactFlowWindow(null));

  state.setCompactFlowWindow(win);
  return win;
}

function openFileInWindow(filePath) {
  const win = createWindow();
  const send = () => {
    if (!win.isDestroyed() && filePath) {
      win.webContents.send("file-opened", filePath);
    }
  };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

// Instância única: um .exe aberto com "Abrir com CompactFlow" cai aqui
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const file = argv.find(isExeArg);
    openFileInWindow(file || null);
  });

  app.whenReady().then(() => {
    createWindow();
    const file = process.argv.find(isExeArg);
    if (file) openFileInWindow(file);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
