const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ICON_CACHE_DIR = path.join(app.getPath('userData'), 'icon-cache');
const ICONS_DIR = path.join(__dirname, '..', '..', 'assets', 'icons');
const EXTRACT_ICON_PY = path.join(__dirname, '..', '..', 'extract_icon.py');

function knownIconSvg(appName) {
  if (!appName) return null;
  try {
    if (!fs.existsSync(ICONS_DIR)) return null;
    const lower = appName.toLowerCase();
    const exact = path.join(ICONS_DIR, `${lower}.svg`);
    if (fs.existsSync(exact)) {
      const svg = fs.readFileSync(exact, 'utf-8');
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
    for (const file of fs.readdirSync(ICONS_DIR)) {
      if (!file.endsWith('.svg')) continue;
      const key = file.slice(0, -4);
      if (lower.includes(key) || key.includes(lower)) {
        const svg = fs.readFileSync(path.join(ICONS_DIR, file), 'utf-8');
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }
    }
  } catch {}
  return null;
}

function cachedIconPath(filePath) {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  const stat = fs.statSync(filePath);
  const mtime = stat.mtimeMs.toString(36);
  return path.join(ICON_CACHE_DIR, `${hash}-${mtime}.png`);
}

function loadCachedIcon(cachePath) {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const data = fs.readFileSync(cachePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch { return null; }
}

function saveCachedIcon(cachePath, data) {
  try {
    fs.mkdirSync(ICON_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, data);
  } catch {}
}

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stderr = '';
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', reject);
    child.on('close', code => resolve({ status: code, stderr }));
  });
}

async function tryExtractIconWrestoolAsync(filePath, outPath) {
  try {
    const r = await spawnAsync('/usr/bin/wrestool', ['-x', '-t', '14', '--output=' + path.dirname(outPath), filePath], { timeout: 10000 });
    if (r.status !== 0) return false;
    const icoFiles = fs.readdirSync(path.dirname(outPath)).filter(f => f.endsWith('.ico') || f.startsWith('icon'));
    if (icoFiles.length === 0) return false;
    const convert = await spawnAsync('/usr/bin/convert', [path.join(path.dirname(outPath), icoFiles[0]), '-resize', '128x128', outPath], { timeout: 5000 });
    return convert.status === 0 && fs.existsSync(outPath);
  } catch { return false; }
}

async function tryExtractIcon7zAsync(filePath, outPath) {
  try {
    const extractDir = path.join(app.getPath('temp'), `cf-icon-7z-${Date.now()}`);
    const r = await spawnAsync('7z', ['x', '-y', '-o' + extractDir, filePath], { timeout: 30000 });
    if (r.status !== 0) { try { fs.rmSync(extractDir, { recursive: true }); } catch {} return false; }
    const icoFiles = [];
    findFilesRecursive(extractDir, icoFiles, f => f.toLowerCase().endsWith('.ico'));
    let success = false;
    if (icoFiles.length > 0 && icoFiles[0] !== outPath) {
      const convert = await spawnAsync('/usr/bin/convert', [icoFiles[0], '-resize', '128x128', outPath], { timeout: 5000 });
      success = convert.status === 0 && fs.existsSync(outPath);
    }
    try { fs.rmSync(extractDir, { recursive: true }); } catch {}
    return success;
  } catch { return false; }
}

function findFilesRecursive(dir, results, predicate) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) findFilesRecursive(p, results, predicate);
      else if (predicate(p)) results.push(p);
    }
  } catch {}
}

ipcMain.handle('extract-icon', async (_, filePath, appName) => {
  try {
    const known = knownIconSvg(appName);
    if (known) return known;

    const cachePath = cachedIconPath(filePath);
    const cached = loadCachedIcon(cachePath);
    if (cached) return cached;

    const tmpDir = app.getPath('temp');
    const outPath = path.join(tmpDir, `cf-icon-${Date.now()}.png`);

    let rawPng = null;

    if (await tryExtractIconWrestoolAsync(filePath, outPath)) {
      rawPng = fs.readFileSync(outPath);
      fs.unlinkSync(outPath);
    }

    if (!rawPng) {
      try {
        const r = await spawnAsync('/usr/bin/python3', [EXTRACT_ICON_PY, filePath, outPath], { timeout: 15000 });
        if (r.status === 0 && fs.existsSync(outPath)) {
          rawPng = fs.readFileSync(outPath);
          fs.unlinkSync(outPath);
        }
      } catch {}
    }

    if (!rawPng) {
      if (await tryExtractIcon7zAsync(filePath, outPath)) {
        rawPng = fs.readFileSync(outPath);
        fs.unlinkSync(outPath);
      }
    }

    if (rawPng) {
      saveCachedIcon(cachePath, rawPng);
      return `data:image/png;base64,${rawPng.toString('base64')}`;
    }
    return null;
  } catch (e) {
    console.error('extract-icon error:', e.message);
    return null;
  }
});
