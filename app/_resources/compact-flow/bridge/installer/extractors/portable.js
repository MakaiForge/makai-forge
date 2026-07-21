const path = require('path');
const fs = require('fs');
const { scanForExes } = require('../utils');

function extract(info, options) {
  const { destPath, onProgress } = options;
  const sourcePath = info.originalPath;

  onProgress?.('Copiando jogo portátil...');

  try {
    fs.mkdirSync(destPath, { recursive: true });

    const entries = fs.readdirSync(sourcePath);
    for (const entry of entries) {
      const src = path.join(sourcePath, entry);
      const dst = path.join(destPath, entry);
      fs.cpSync(src, dst, { recursive: true, force: true });
    }

    const candidates = scanForExes(destPath);
    return { success: true, destDir: destPath, candidates, registryNeeded: false, error: null };
  } catch (err) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: err.message };
  }
}

module.exports = { extract };
