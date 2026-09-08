const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { scanForExes } = require('../utils');

function extract(info, options) {
  const { destPath, onProgress, signal } = options;
  const isoPath = info.originalPath;

  onProgress?.('Extraindo ISO com 7z...');

  const tmpDir = fs.mkdtempSync('/tmp/installer-iso-');

  try {
    fs.mkdirSync(destPath, { recursive: true });

    execFileSync('7z', ['x', '-y', '-o' + tmpDir, isoPath], {
      stdio: 'pipe',
      timeout: 300000,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    for (const entry of fs.readdirSync(tmpDir)) {
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
