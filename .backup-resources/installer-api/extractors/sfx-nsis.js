const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { scanForExes } = require('../utils');

function extract(info, options) {
  const { destPath, onProgress, signal } = options;
  const exePath = info.originalPath;

  onProgress?.('Extraindo archive do EXE com 7z...');

  const tmpDir = fs.mkdtempSync('/tmp/installer-sfx-nsis-');

  try {
    fs.mkdirSync(destPath, { recursive: true });

    execFileSync('7z', ['x', '-y', '-o' + tmpDir, exePath], {
      stdio: 'pipe',
      timeout: 300000,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      if (/^\$/.test(entry)) continue;
      const src = path.join(tmpDir, entry);
      const dst = path.join(destPath, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        fs.cpSync(src, dst, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
      }
    }

    const candidates = scanForExes(destPath);
    return { success: true, destDir: destPath, candidates, registryNeeded: false, error: null };
  } catch (err) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: err.message };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { extract };
