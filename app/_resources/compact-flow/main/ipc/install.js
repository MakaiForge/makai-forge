const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

function bridgePath(...segments) {
  if (app.isPackaged) {
    return path.resolve(app.getAppPath(), '../..', 'bridge', ...segments);
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

ipcMain.handle('close-app', async () => {
  app.quit();
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

  const pfCandidates = [
    process.env.MAKAI_FORGE_DIR,
    path.join(os.homedir(), 'Documentos', 'Makai_forge'),
    path.join(os.homedir(), 'Documents', 'Makai_forge'),
    '/opt/makai-forger',
    '/usr/lib/makai-forger',
  ].filter(Boolean);
  let pfDir = null;
  for (const c of pfCandidates) {
    const ebin = path.join(c, 'node_modules', '.bin', 'electron');
    if (fs.existsSync(ebin)) { pfDir = c; break; }
  }
  if (pfDir) {
    spawn(path.join(pfDir, 'node_modules', '.bin', 'electron'), [pfDir, '--no-sandbox', '--disable-gpu'], {
      cwd: pfDir,
      stdio: 'ignore',
      detached: true,
    }).unref();
  }
  app.quit();
});
