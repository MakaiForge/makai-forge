const fs = require('fs');
const path = require('path');

const COMPAT_DIRS = [
  path.join(require('os').homedir(), '.config', 'protonforge', 'compat-tools', 'compatibilitytools.d'),
  path.join(require('os').homedir(), '.config', 'makai-forger', 'compat-tools', 'compatibilitytools.d'),
];

function findProtonBinary(dir) {
  for (const candidate of ['proton', 'files/proton', 'files/bin/proton', 'dist/proton', 'bin/proton']) {
    const p = path.join(dir, candidate);
    if (fs.existsSync(p)) return p;
  }
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isFile() && f === 'proton') return p;
      if (fs.statSync(p).isDirectory()) {
        for (const f2 of fs.readdirSync(p)) {
          const p2 = path.join(p, f2);
          if (f2 === 'proton' && fs.statSync(p2).isFile()) return p2;
        }
      }
    }
  } catch {}
  return null;
}

function inferName(dirName) {
  const map = {
    'dwproton': 'DW-Proton',
    'proton': 'Proton',
    'proton-ge': 'GE-Proton',
    'ge-proton': 'GE-Proton',
    'proton-cachyos': 'CachyOS Proton',
    'proton-tkg': 'Proton-TKG',
    'proton-exp': 'Proton Experimental',
    'proton-em': 'Proton-EM',
  };
  const lower = dirName.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (lower.startsWith(k)) {
      const rest = dirName.slice(k.length).replace(/^-/, '');
      return rest ? `${v} ${rest}` : v;
    }
  }
  return dirName;
}

function listInstalled() {
  const versions = [];
  const seen = new Set();
  for (const compatDir of COMPAT_DIRS) {
    if (!fs.existsSync(compatDir)) continue;
    for (const entry of fs.readdirSync(compatDir)) {
      const dir = path.join(compatDir, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const realPath = fs.realpathSync(dir);
      if (seen.has(realPath)) continue;
      seen.add(realPath);
      const protonBin = findProtonBinary(dir);
      if (protonBin) {
        versions.push({ name: inferName(entry), dir, version: entry, protonBin });
      }
    }
  }
  return versions;
}

const COMPAT_DIR = COMPAT_DIRS[0];

module.exports = { listInstalled, findProtonBinary, inferName, COMPAT_DIR, COMPAT_DIRS };
