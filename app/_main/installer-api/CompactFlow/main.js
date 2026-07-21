const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { analyze } = require('./core/analyzer');

let mainWindow;

function detectDistro() {
  try {
    const raw = fs.readFileSync('/etc/os-release', 'utf-8');
    let id = '', idLike = '', name = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('ID=')) id = line.slice(3).replace(/"/g, '').trim();
      if (line.startsWith('ID_LIKE=')) idLike = line.slice(8).replace(/"/g, '').trim();
      if (line.startsWith('PRETTY_NAME=')) name = line.slice(12).replace(/"/g, '').trim();
    }
    return { id, idLike, name };
  } catch {
    return { id: 'unknown', idLike: '', name: 'Linux' };
  }
}

function getInstallCmd(pkg) {
  const { id, idLike } = detectDistro();
  const all = [id, ...idLike.split(/\s+/)].filter(Boolean);

  if (all.some(x => ['arch', 'artix', 'endeavouros', 'cachyos'].includes(x)))
    return `sudo pacman -S --noconfirm ${pkg}`;
  if (all.some(x => ['fedora', 'rhel', 'centos'].includes(x)))
    return `sudo dnf install -y ${pkg}`;
  if (all.some(x => ['debian', 'ubuntu', 'pop', 'linuxmint', 'zorin', 'elementary'].includes(x)))
    return `sudo apt install -y ${pkg}`;
  if (all.some(x => ['opensuse', 'suse'].includes(x)))
    return `sudo zypper install -y ${pkg}`;
  if (all.some(x => ['void'].includes(x)))
    return `sudo xbps-install -y ${pkg}`;
  if (all.some(x => ['gentoo', 'funtoo'].includes(x)))
    return `sudo emerge -a ${pkg}`;
  if (all.some(x => ['alpine'].includes(x)))
    return `sudo apk add ${pkg}`;
  if (all.some(x => ['nixos'].includes(x)))
    return `nix-env -iA nixos.${pkg}`;
  if (all.some(x => ['solus'].includes(x)))
    return `sudo eopkg install ${pkg}`;
  if (all.some(x => ['slackware'].includes(x)))
    return `sudo slackpkg install ${pkg}`;

  return `sudo pacman -S ${pkg}`;
}

function getDistroInfo() {
  const distro = detectDistro();
  return {
    name: distro.name || 'Linux',
    id: distro.id,
    idLike: distro.idLike,
    arch: process.arch,
  };
}

function findTerminal() {
  const env = process.env.TERMINAL;
  if (env && fs.existsSync(env)) return env;

  try {
    const kde = require('child_process').execSync(
      'kreadconfig6 --file kdeglobals --group General --key TerminalApplication',
      { encoding: 'utf-8', timeout: 3000 }
    ).trim();
    if (kde) {
      const p = kde.startsWith('/') ? kde : `/usr/bin/${kde}`;
      if (fs.existsSync(p)) return p;
    }
  } catch {}

  const check = (p) => fs.existsSync(p) ? p : null;

  const result = check('/usr/bin/x-terminal-emulator');
  if (result) return result;

  const list = [
    '/usr/bin/konsole', '/usr/bin/kitty', '/usr/bin/gnome-terminal',
    '/usr/bin/xfce4-terminal', '/usr/bin/lxterminal', '/usr/bin/alacritty',
    '/usr/bin/terminator', '/usr/bin/urxvt', '/usr/bin/xterm',
  ];
  for (const p of list) {
    const r = check(p);
    if (r) return r;
  }
  return null;
}

const TERMINAL_CMDS = {
  konsole:         (c) => ['--hold', '-e', 'bash', '-c', c],
  kitty:           (c) => ['-e', 'bash', '-c', c],
  'gnome-terminal': (c) => ['--', 'bash', '-c', c],
  'xfce4-terminal': (c) => ['--hold', '-e', 'bash', '-c', c],
  lxterminal:      (c) => ['-e', 'bash', '-c', c],
  alacritty:       (c) => ['-e', 'bash', '-c', c],
  terminator:      (c) => ['-e', 'bash', '-c', c],
  urxvt:           (c) => ['-hold', '-e', 'bash', '-c', c],
  xterm:           (c) => ['-hold', '-e', 'bash', '-c', c],
};

function openTerminal(command) {
  const term = findTerminal();
  if (!term) return false;
  const name = path.basename(term);
  const wrapper = `${command}; echo; read -p 'Pressione Enter para fechar...'`;
  const argsFn = TERMINAL_CMDS[name];
  const args = argsFn ? argsFn(wrapper) : ['-e', 'bash', '-c', wrapper];
  try {
    spawn(term, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch { return false; }
}

function parseFileUrl(arg) {
  if (!arg.startsWith('file://')) return arg;
  const filePath = decodeURIComponent(arg.slice(7));
  return process.platform === 'win32' && filePath.startsWith('/') ? filePath.slice(1) : filePath;
}

function getFileFromArgv(argv) {
  const args = (argv || process.argv).slice(1);
  const appDir = __dirname;
  for (const arg of args) {
    if (arg === appDir) continue;
    if (arg.startsWith('-')) continue;
    const filePath = parseFileUrl(arg);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return path.resolve(filePath);
    }
  }
  return null;
}

function sendFile(filePath) {
  if (!mainWindow || !filePath) return;
  mainWindow.webContents.send('file-opened', filePath);
}

function createWindow(filePath) {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 440,
    minWidth: 420,
    minHeight: 360,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    title: 'CompatFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'compatflow.svg'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    sendFile(filePath);
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const filePath = getFileFromArgv(argv);
      if (filePath) {
        const wc = mainWindow.webContents;
        if (wc.isLoading()) {
          wc.once('did-finish-load', () => sendFile(filePath));
        } else {
          sendFile(filePath);
        }
      }
    }
  });

  app.whenReady().then(() => {
    const filePath = getFileFromArgv();
    createWindow(filePath);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
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

// ─── Bridge: Catalog Proton Forger ───
const CATALOG_DB = path.join(__dirname, '..', '..', '..', 'resources', 'database', 'catalogo.db');
const { execFile } = require('child_process');

function enrichGame(g) {
  if (!g) return null;
  const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return {
    objectId: g.objectId,
    title: g.title,
    shop: g.shop,
    genres: parse(g.genres),
    libraryImageUrl: g.libraryImageUrl,
    shortDescription: g.shortDescription,
    developer: g.developer,
    releaseYear: g.releaseYear,
    recommendedProton: g.recommendedProton,
    protonConfidence: g.protonConfidence,
    protonSource: g.protonSource,
    protonAlternatives: parse(g.protonAlternatives),
    screenshots: parse(g.screenshots),
  };
}

function sqliteQuery(sql) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/sqlite3', ['-json', CATALOG_DB, sql], { timeout: 10000 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error('Invalid JSON from sqlite3')); }
    });
  });
}

ipcMain.handle('catalog-search', async (_, gameName) => {
  const query = (gameName || '').trim().toLowerCase();
  if (!query) return [];

  // FTS5 search
  try {
    const terms = query.split(/\s+/).map(t => `"${t}"*`).join(' ');
    const rows = await sqliteQuery(`SELECT objectId FROM games_fts WHERE games_fts MATCH '${terms.replace(/'/g, "''")}' ORDER BY rank LIMIT 5`);
    if (rows.length > 0) {
      const ids = rows.map(r => `'${r.objectId.replace(/'/g, "''")}'`).join(',');
      const games = await sqliteQuery(`SELECT * FROM games WHERE objectId IN (${ids})`);
      return games.map(enrichGame);
    }
  } catch {}

  // Fallback: LIKE
  try {
    const games = await sqliteQuery(
      `SELECT * FROM games WHERE LOWER(title) LIKE '%${query.replace(/'/g, "''")}%' ORDER BY estimated_owners DESC LIMIT 5`
    );
    return games.map(enrichGame);
  } catch { return []; }
});

// ─── Resolve bridge path (works in ASAR, dev, and standalone) ───
function bridgePath(...segments) {
  // In packaged mode, bridge was copied to {installDir}/bridge/ on real FS
  // app.getAppPath() → /opt/compatflow/resources/app.asar
  // We need /opt/compatflow/bridge/ → ../.. from app.asar
  if (app.isPackaged) {
    return path.resolve(app.getAppPath(), '../..', 'bridge', ...segments);
  }
  return path.join(__dirname, 'bridge', ...segments);
}

// ─── Bridge: Proton Tools ───
let protonTools;
try {
  protonTools = require(path.join(__dirname, 'bridge', 'proton-tools.js'));
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
  return new Promise((resolve, reject) => {
    execFileAsync('/usr/bin/node', [bridgePath('proton-tools.js'), 'forks'], {
      timeout: 15000,
      encoding: 'utf-8',
    }, (err, stdout) => {
      if (err) {
        console.error('proton-forks error:', err.message);
        reject(err);
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve(data);
      } catch (e) {
        reject(new Error('Invalid JSON from proton-tools forks: ' + stdout.slice(0, 200)));
      }
    });
  });
});

// ─── Bridge: Logger Control ───
const LOGGER_PATH = path.join(os.homedir(), 'Documentos', 'CompatibilityFlow.log');

ipcMain.handle('get-log-path', () => LOGGER_PATH);

ipcMain.handle('set-log-enabled', (_, enabled) => {
  process.env.COMPATFLOW_LOG = enabled ? '1' : '0';
  return { enabled };
});

ipcMain.handle('open-log', async () => {
  const { shell } = require('electron');
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

// ─── Bridge: Install Game ───

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
  // Salva jogo na biblioteca do Proton Forger (BLOQUEANTE: só continua depois que o JSON foi escrito)
  if (gameData && gameData.title && gameData.exePath) {
    try {
      const out = require('child_process').execFileSync('/usr/bin/node', [
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

  // Sinaliza para o Proton Forger atualizar a aba Games (só depois que o jogo já está no JSON)
  const refreshFlag = path.join(app.getPath('userData'), '.compatflow-refresh');
  try {
    fs.writeFileSync(refreshFlag, Date.now().toString(), 'utf-8');
  } catch (e) {
    console.error('Failed to write refresh flag:', e.message);
  }

  // Abre Proton Forger
  const pfDir = path.resolve(__dirname, '..', '..', '..');
  const electronBin = path.join(pfDir, 'node_modules', '.bin', 'electron');
  if (fs.existsSync(electronBin)) {
    require('child_process').spawn(electronBin, [pfDir, '--no-sandbox', '--disable-gpu'], {
      cwd: pfDir,
      stdio: 'ignore',
      detached: true,
    }).unref();
  }
  app.quit();
});

ipcMain.handle('extract-icon', async (_, filePath) => {
  try {
    const tmpDir = app.getPath('temp');
    const outPath = path.join(tmpDir, `cf-icon-${Date.now()}.png`);
    const result = spawnSync('/usr/bin/exe-thumbnailer', ['-s', '128', filePath, outPath], { timeout: 5000 });
    if (result.status !== 0 || !fs.existsSync(outPath)) {
      console.error(`extract-icon failed for ${filePath}: status=${result.status}, error=${result.error?.message}`);
      return null;
    }
    const data = fs.readFileSync(outPath);
    fs.unlinkSync(outPath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch (e) {
    console.error('extract-icon error:', e.message);
    return null;
  }
});
