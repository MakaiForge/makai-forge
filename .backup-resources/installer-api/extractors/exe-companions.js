const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const { scanForExes, get7zFirstVolume, getRarFirstVolume } = require('../utils');

function scanCompanions(exePath, pattern) {
  const dir = path.dirname(exePath);
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (regex.test(entry)) {
        results.push(path.join(dir, entry));
      }
    }
  } catch {}
  return results.sort();
}

function extract(info, options) {
  const { destPath, protonPath, onProgress, signal } = options;
  const exePath = info.originalPath;
  let companions = info.companionArchives || [];

  if (companions.length === 0 && info.extractorOptions?.companionPattern) {
    companions = scanCompanions(exePath, info.extractorOptions.companionPattern);
  }

  if (companions.length === 0) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: 'no companion archives found' };
  }

  const tmpDir = fs.mkdtempSync('/tmp/installer-exe-companions-');

  try {
    onProgress?.('Extraindo companions nativamente...');

    const firstCompanion = companions[0];
    const low = firstCompanion.toLowerCase();
    let cmd, args;

    if (/\.zip$/.test(low)) {
      cmd = 'unzip';
      args = ['-o', firstCompanion, '-d', tmpDir];
    } else if (/\.rar$/.test(low) || /\.r\d{2}$/.test(firstCompanion)) {
      cmd = 'unrar';
      args = ['x', '-y', firstCompanion, tmpDir + '/'];
    } else {
      cmd = '7z';
      args = ['x', '-y', '-mmt', '-o' + tmpDir, firstCompanion];
    }

    execFileSync(cmd, args, {
      stdio: 'pipe',
      timeout: 3600000,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    onProgress?.('Movendo arquivos para o prefixo...');
    fs.mkdirSync(destPath, { recursive: true });

    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      const src = path.join(tmpDir, entry);
      const dst = path.join(destPath, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        fs.cpSync(src, dst, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
      }
    }

    if (!info.needsRegistrySetup) {
      const candidates = scanForExes(destPath);
      return { success: true, destDir: destPath, candidates, registryNeeded: false, error: null };
    }

    onProgress?.('Configurando registro via Wine...');
    const wineBin = protonPath
      ? (() => {
          const bin = path.join(protonPath, 'files', 'bin', 'wine64');
          const fallback = path.join(protonPath, 'files', 'bin', 'wine');
          return fs.existsSync(bin) ? bin : fallback;
        })()
      : 'wine64';

    const env = { ...process.env };
    env.WINEPREFIX = path.dirname(path.dirname(destPath));
    if (protonPath) {
      env.WINEDEBUG = '-all';
      env.PROTON_NO_ESYNC = '1';
      env.PROTON_NO_FSYNC = '1';
      env.PROTON_NO_D3D11 = '1';
      env.PROTON_NO_VKD3D = '1';
      env.PROTON_NO_D3D12 = '1';
      env.PROTON_NO_NVAPI = '1';
      env.PROTON_HEAPTYPES = '0';
      env.PROTON_HIDE_NVIDIA_GPU = '1';
      env.PROTON_USE_WINED3D11 = '1';
    }

    spawnSync(wineBin, [exePath], {
      env,
      stdio: 'inherit',
      timeout: 3600000,
      signal,
    });

    const candidates = scanForExes(destPath);
    return { success: true, destDir: destPath, candidates, registryNeeded: true, error: null };
  } catch (err) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: err.message };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { extract };
