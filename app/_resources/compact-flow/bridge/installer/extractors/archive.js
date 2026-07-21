const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { scanForExes } = require('../utils');

function extract(info, options) {
  const { destPath, onProgress, signal } = options;
  const archives = info.archivesToExtract || info.companionArchives || [info.originalPath];

  if (archives.length === 0) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: 'no archives to extract' };
  }

  const first = archives[0];
  const low = first.toLowerCase();
  let cmd, args;

  if (/\.(tar\.gz|tgz)$/.test(low)) {
    cmd = 'tar';
    args = ['xzf', first, '-C', destPath];
  } else if (/\.(tar\.xz|txz)$/.test(low)) {
    cmd = 'tar';
    args = ['xJf', first, '-C', destPath];
  } else if (/\.tar$/.test(low)) {
    cmd = 'tar';
    args = ['xf', first, '-C', destPath];
  } else if (/\.zip$/.test(low)) {
    cmd = 'unzip';
    args = ['-o', first, '-d', destPath];
  } else if (/\.rar$/.test(low) || /\.r\d{2}$/.test(first)) {
    cmd = 'unrar';
    args = ['x', '-y', first, destPath + '/'];
  } else {
    cmd = '7z';
    args = ['x', '-y', '-mmt', '-o' + destPath, first];
  }

  onProgress?.(`Extraindo archive com ${cmd}...`);

  try {
    fs.mkdirSync(destPath, { recursive: true });
    execFileSync(cmd, args, {
      stdio: 'pipe',
      timeout: 3600000,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });
    const candidates = scanForExes(destPath);
    return { success: true, destDir: destPath, candidates, registryNeeded: false, error: null };
  } catch (err) {
    return { success: false, destDir: null, candidates: [], registryNeeded: false, error: err.message };
  }
}

module.exports = { extract };
