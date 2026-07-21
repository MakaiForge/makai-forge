const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { scanForExes } = require('../utils');

function extract(info, options) {
  const { destPath, onProgress, signal } = options;
  const exePath = info.originalPath;

  onProgress?.('Extraindo com innoextract...');

  const tmpDir = fs.mkdtempSync('/tmp/installer-inno-std-');

  try {
    execFileSync('innoextract', ['-d', tmpDir, '--lowercase', exePath], {
      stdio: 'pipe',
      timeout: 300000,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    fs.mkdirSync(destPath, { recursive: true });

    const appDir = path.join(tmpDir, 'app');
    const srcDir = fs.existsSync(appDir) ? appDir : tmpDir;

    for (const entry of fs.readdirSync(srcDir)) {
      const src = path.join(srcDir, entry);
      const dst = path.join(destPath, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        fs.cpSync(src, dst, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
      }
    }

    const tmpSub = path.join(tmpDir, 'tmp');
    if (fs.existsSync(tmpSub)) {
      fs.rmSync(tmpSub, { recursive: true, force: true });
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
