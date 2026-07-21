const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { analyze } = require('../../core/analyzer');
const { getDistroInfo, getInstallCmd } = require('../distro');
const { openTerminal } = require('../terminal');
const state = require('../state');

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(state.win, {
    properties: ['openFile'],
    filters: [
      { name: 'Executáveis Windows', extensions: ['exe', 'msi'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('analyze-file', async (_, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xz') {
    const stat = fs.statSync(filePath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    return {
      type: 'archive',
      original: path.basename(filePath),
      clean_name: path.basename(filePath, '.xz'),
      size_mb: sizeMB,
      full_path: filePath,
    };
  }
  const result = analyze(filePath);
  result.distro = getDistroInfo();
  result.install_cmd = result.package ? getInstallCmd(result.package) : null;
  return result;
});

ipcMain.handle('install-package', async (_, command) => {
  return openTerminal(command);
});
