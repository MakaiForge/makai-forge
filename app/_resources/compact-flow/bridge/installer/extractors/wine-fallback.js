const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { scanForExes } = require('../utils');

function extract(info, options) {
  const { destPath, protonPath, onProgress, signal } = options;
  const exePath = info.originalPath;

  onProgress?.('Usando Wine + Proton para instalação (fallback)...');

  const wineBin = protonPath
    ? (() => {
        const bin = path.join(protonPath, 'files', 'bin', 'wine64');
        const fallback = path.join(protonPath, 'files', 'bin', 'wine');
        return fs.existsSync(bin) ? bin : fallback;
      })()
    : 'wine64';

  const prefixPath = path.dirname(path.dirname(destPath));

  const env = { ...process.env };
  env.WINEPREFIX = prefixPath;
  env.WINEDEBUG = '-all';
  env.PROTON_LOG = '1';
  env.PROTON_NO_ESYNC = '1';
  env.PROTON_NO_FSYNC = '1';
  env.PROTON_NO_D3D11 = '1';
  env.PROTON_NO_VKD3D = '1';
  env.PROTON_NO_D3D12 = '1';
  env.PROTON_NO_NVAPI = '1';
  env.PROTON_HEAPTYPES = '0';
  env.PROTON_HIDE_NVIDIA_GPU = '1';
  env.PROTON_USE_WINED3D11 = '1';

  try {
    const result = spawnSync(wineBin, [exePath], {
      env,
      stdio: 'inherit',
      timeout: 3600000,
      signal,
    });

    const candidates = scanForExes(destPath);
    return {
      success: result.status === 0,
      destDir: destPath,
      candidates,
      registryNeeded: true,
      error: result.error?.message || (result.status !== 0 ? `exit code ${result.status}` : null),
    };
  } catch (err) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: err.message };
  }
}

module.exports = { extract };
