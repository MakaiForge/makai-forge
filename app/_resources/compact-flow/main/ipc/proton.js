const { ipcMain } = require('electron');
const path = require('path');

let protonTools;
try {
  protonTools = require(path.join(__dirname, '..', '..', 'bridge', 'proton-tools.js'));
} catch (e) {
  console.error('Failed to load proton-tools bridge, using fallback:', e.message);
  protonTools = {
    listInstalled: () => [],
    listAvailable: () => [],
    installProton: () => null,
    rateReleases: () => ({}),
  };
}

ipcMain.handle('proton-list', async () => {
  return protonTools.listInstalled();
});

ipcMain.handle('proton-available', async () => {
  return protonTools.listAvailable();
});

ipcMain.handle('proton-install', async (_, tag, url) => {
  try {
    const result = protonTools.installProton(tag, url);
    return { success: true, version: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('proton-release-ratings', async (_, releases) => {
  try {
    const data = protonTools.rateReleases(releases);
    return { success: true, data };
  } catch (e) {
    console.error('proton-release-ratings error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('proton-forks', async () => {
  try {
    const { listForkIds } = require('../../bridge/proton/forks');
    return listForkIds();
  } catch (e) {
    console.error('proton-forks error:', e.message);
    return [];
  }
});
