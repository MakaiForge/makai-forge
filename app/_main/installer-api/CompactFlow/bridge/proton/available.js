const fs = require('fs');
const path = require('path');

const PF_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..');
const RELEASES_DIR = path.join(PF_DIR, 'data', 'releases');

function toolName(toolId) {
  const map = {
    'proton-ge': 'GE-Proton',
    'valve-proton': 'Valve Proton',
    'dw-proton': 'DW-Proton',
    'proton-cachyos': 'CachyOS Proton',
    'proton-tkg': 'Proton-TKG',
    'proton-em': 'Proton-EM',
    'proton-ge-rtsp': 'GE-Proton RTSP',
    'wine-vanilla': 'Wine Vanilla',
    'wine-staging': 'Wine Staging',
    'wine-tkg': 'Wine-TKG',
  };
  return map[toolId] || toolId;
}

const ARCH = require('os').arch();
const ARCH_PATTERN = ARCH === 'arm64' ? 'arm64' : 'x86_64';

function archMatch(name) {
  return name.includes('arm64') ? ARCH === 'arm64' : true;
}

function listAvailable() {
  const all = [];
  if (!fs.existsSync(RELEASES_DIR)) return all;
  for (const file of fs.readdirSync(RELEASES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const toolId = file.replace('.json', '');
    try {
      const releases = JSON.parse(fs.readFileSync(path.join(RELEASES_DIR, file), 'utf-8'));
      const withAssets = releases
        .filter(r => r.assets && r.assets.some(a => a.name.endsWith('.tar.gz') || a.name.endsWith('.tar.xz')))
        .slice(0, 5)
        .map(r => {
          const archAssets = r.assets.filter(a => (a.name.endsWith('.tar.gz') || a.name.endsWith('.tar.xz')) && archMatch(a.name));
          const preferred = archAssets.find(a => a.name.includes(ARCH_PATTERN));
          const tarAsset = preferred || archAssets[0];
          if (!tarAsset) return null;
          return {
            tag: r.tag_name,
            name: tarAsset?.name || '',
            url: tarAsset?.browser_download_url || '',
            size: tarAsset?.size || 0,
            published: r.published_at || r.created_at || '',
          };
        })
        .filter(Boolean);
      if (withAssets.length > 0) {
        all.push({ toolId, name: toolName(toolId), releases: withAssets });
      }
    } catch {}
  }
  return all;
}

module.exports = { listAvailable, RELEASES_DIR };
