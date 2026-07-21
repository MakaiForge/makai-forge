const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LOGGER_PATH = path.join(os.homedir(), 'Documentos', 'CompatibilityFlow.log');

ipcMain.handle('get-log-path', () => LOGGER_PATH);

ipcMain.handle('set-log-enabled', (_, enabled) => {
  process.env.COMPATFLOW_LOG = enabled ? '1' : '0';
  return { enabled };
});

ipcMain.handle('open-log', async () => {
  try {
    const dir = path.dirname(LOGGER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(LOGGER_PATH)) fs.writeFileSync(LOGGER_PATH, '', 'utf-8');
    await shell.openPath(LOGGER_PATH);
  } catch (e) {
    return { error: e.message };
  }
  return { success: true };
});
