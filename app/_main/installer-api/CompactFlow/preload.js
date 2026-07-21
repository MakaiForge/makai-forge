const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('compatflow', {
  openFile: () => ipcRenderer.invoke('open-file'),
  analyzeFile: (filePath) => ipcRenderer.invoke('analyze-file', filePath),
  installPackage: (command) => ipcRenderer.invoke('install-package', command),
  extractIcon: (filePath) => ipcRenderer.invoke('extract-icon', filePath),
  catalogSearch: (gameName) => ipcRenderer.invoke('catalog-search', gameName),
  protonList: () => ipcRenderer.invoke('proton-list'),
  protonAvailable: () => ipcRenderer.invoke('proton-available'),
  protonInstall: (tag, url) => ipcRenderer.invoke('proton-install', tag, url),
  protonForks: () => ipcRenderer.invoke('proton-forks'),
  gameInstall: (opts) => ipcRenderer.invoke('game-install', opts),
  getReleaseRatings: (releases) => ipcRenderer.invoke('proton-release-ratings', releases),
  closeApp: () => ipcRenderer.invoke('close-app'),
  openProtonForger: (gameData) => ipcRenderer.invoke('open-proton-forger', gameData),
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_, filePath) => callback(filePath));
  },
  onInstallLog: (callback) => {
    const handler = (_, line) => callback(line);
    ipcRenderer.on('install-log', handler);
    return () => ipcRenderer.removeListener('install-log', handler);
  },
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  setLogEnabled: (enabled) => ipcRenderer.invoke('set-log-enabled', enabled),
  openLogFile: () => ipcRenderer.invoke('open-log'),
});
