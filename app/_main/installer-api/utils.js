const path = require('path');
const fs = require('fs');

function scanDirForArchives(dirPath) {
  const archives = [];
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (!stat.isFile()) continue;

      const low = entry.toLowerCase();
      if (/\.(7z|rar|zip|tar\.gz|tgz|tar\.xz|tar)$/.test(low) && stat.size > 100 * 1024 * 1024) {
        archives.push(fullPath);
      }
      if (/\.7z\.\d{3}$/.test(low) && stat.size > 100 * 1024 * 1024) {
        archives.push(fullPath);
      }
      if (/\.r\d{2}$/.test(low) && stat.size > 100 * 1024 * 1024) {
        archives.push(fullPath);
      }
    }
  } catch {}
  return archives;
}

function collectFiles(dir, base = '') {
  let result = [];
  try {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      const rel = base ? base + '/' + e : e;
      try {
        if (fs.statSync(p).isDirectory()) result = result.concat(collectFiles(p, rel));
        else result.push(rel);
      } catch {}
    }
  } catch {}
  return result;
}

function countFiles(dir) {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir)) {
      try {
        const p = path.join(dir, e);
        n += fs.statSync(p).isDirectory() ? countFiles(p) : 1;
      } catch {}
    }
  } catch {}
  return n;
}

function findFile(dir, predicate) {
  try {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      try {
        if (fs.statSync(p).isDirectory()) { const f = findFile(p, predicate); if (f) return f; }
        else if (predicate(e)) return p;
      } catch {}
    }
  } catch {}
  return null;
}

function guessGameName(filePath) {
  const name = path.basename(filePath, path.extname(filePath))
    .replace(/\.\d{3}$/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || 'Game';
}

function get7zFirstVolume(archives) {
  const sorted = [...archives].sort();
  const first = sorted.find(a => /\.001$/.test(a) || /\.7z$/.test(a) && !/\.\d{3}$/.test(a));
  return first || sorted[0];
}

function getRarFirstVolume(archives) {
  const sorted = [...archives].sort();
  const first = sorted.find(a => /\.rar$/i.test(a) || /\.r00$/i.test(a));
  return first || sorted[0];
}

function scanForExes(dirPath) {
  const exes = [];
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, entry);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (stat.isDirectory()) {
        exes.push(...scanForExes(fullPath));
      } else if (/\.exe$/i.test(entry)) {
        exes.push(fullPath);
      }
    }
  } catch {}
  return exes;
}

module.exports = {
  scanDirForArchives,
  scanForExes,
  collectFiles,
  countFiles,
  findFile,
  guessGameName,
  get7zFirstVolume,
  getRarFirstVolume,
};
