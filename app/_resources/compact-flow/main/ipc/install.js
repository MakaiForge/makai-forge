const { ipcMain, app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

function bridgePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', '_resources', 'compact-flow', 'bridge', ...segments);
  }
  return path.join(__dirname, '..', '..', 'bridge', ...segments);
}

ipcMain.handle('game-install', async (event, opts) => {
  const { gameId, gameTitle, exePath, protonPath } = opts;

  return new Promise((resolve) => {
    const child = spawn('/usr/bin/node', [
      bridgePath('install-game.js'),
      '--game-id', gameId,
      '--game-title', gameTitle || gameId,
      '--exe', exePath,
      '--proton-path', protonPath,
    ], { timeout: 7200000, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          try { event.sender.send('install-log', line); } catch {}
        }
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    child.on('close', () => {
      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines.filter(l => l.trim()).pop();
        if (lastLine) {
          resolve(JSON.parse(lastLine));
        } else {
          resolve({ success: false, error: 'No output from bridge' });
        }
      } catch {
        resolve({ success: false, error: 'Invalid bridge output' });
      }
    });
  });
});

function findMainWindow() {
  return BrowserWindow.getAllWindows().find(w => {
    try { return !w.isDestroyed() && w.webContents && w.webContents.getURL().includes('renderer/index.html'); }
    catch { return false; }
  });
}

ipcMain.handle('close-app', async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('open-proton-forger', async (_, gameData) => {
  if (gameData && gameData.title && gameData.exePath) {
    try {
      const out = execFileSync('/usr/bin/node', [
        bridgePath('add-to-library.js'),
        '--title', gameData.title,
        '--exe-path', gameData.exePath,
        '--prefix-path', gameData.prefixPath || '',
        '--proton-version', gameData.protonVersion || '',
        '--proton-path', gameData.protonPath || '',
      ], { timeout: 60000, stdio: 'pipe' });
      console.log(`[CompatFlow] add-to-library.js output:`, out.toString().trim());
    } catch (e) {
      console.error(`[CompatFlow] add-to-library.js failed: ${e.message}`, e.stderr?.toString());
    }
  }

  const refreshFlag = path.join(app.getPath('userData'), '.compatflow-refresh');
  try {
    fs.writeFileSync(refreshFlag, Date.now().toString(), 'utf-8');
  } catch (e) {
    console.error('Failed to write refresh flag:', e.message);
  }

  const mainWin = findMainWindow();
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.focus();
  }

  const cfWin = BrowserWindow.getFocusedWindow();
  if (cfWin && !cfWin.isDestroyed()) cfWin.close();
});
