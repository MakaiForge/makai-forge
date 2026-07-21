const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const CACHE_DIR = path.join(os.homedir(), '.cache', 'compatflow', 'deps');
const INDEX_URL = 'https://raw.githubusercontent.com/lucasgertke11-bot/compatflow-deps/main/index.json';

const BUILTIN_DEPS = [
  { id: 'vcrun',     package_url: 'https://github.com/lucasgertke11-bot/vcrun/releases/download/v1.0.0/vcrun.7z',     package_sha256: '4879c12b4051c59fd373247c0d7dfe0f327a5bdd9c6de6d4acd871e2064d7a24', package_size: 16295725, registry_url: null,                                  extract_to: 'windows/' },
  { id: 'dotnet35',  package_url: 'https://github.com/lucasgertke11-bot/dotnet35/releases/download/v1.0.0/dotnet35.7z',  package_sha256: 'f9db1f1f21c01622d046cd2ccd841bb32129d8167a4bbca482f4b5c6d63f8501', package_size: 52602657, registry_url: 'https://github.com/lucasgertke11-bot/dotnet35/releases/download/v1.0.0/dotnet35.reg',  extract_to: 'windows/' },
  { id: 'dotnet48',  package_url: 'https://github.com/lucasgertke11-bot/dotnet48/releases/download/v1.0.0/dotnet48.7z',  package_sha256: '4d1d18b6015756d3fa6fac698a290fa50513a772dd700782c8e5efd080c2a49b', package_size: 272988283, registry_url: 'https://github.com/lucasgertke11-bot/dotnet48/releases/download/v1.0.0/dotnet48.reg',  extract_to: 'windows/' },
  { id: 'd3dx9',     package_url: 'https://github.com/lucasgertke11-bot/d3dx9/releases/download/v1.0.0/d3dx9.7z',        package_sha256: 'b0a50646515d20b9a30a1120a5271bc9b7de18ac6573a65fb3a1dcef6d145dcf', package_size: 20274707, registry_url: null,                                  extract_to: 'windows/' },
  { id: 'd3dx11_43', package_url: 'https://github.com/lucasgertke11-bot/d3dx11_43/releases/download/v1.0.0/d3dx11_43.7z', package_sha256: '01f26306492ad1ca37367d0037e825619be388e201a7e91adcecdf9872f7cb32', package_size: 155720,   registry_url: 'https://github.com/lucasgertke11-bot/d3dx11_43/releases/download/v1.0.0/d3dx11_43.reg', extract_to: 'windows/' },
  { id: 'xact',      package_url: 'https://github.com/lucasgertke11-bot/xact/releases/download/v1.0.0/xact.7z',         package_sha256: 'e7ac32540e6a77d5a2edc6b59f229096b372f4ad50104d2100d7c7862c37b91e', package_size: 1550474,  registry_url: 'https://github.com/lucasgertke11-bot/xact/releases/download/v1.0.0/xact.reg',         extract_to: 'windows/' },
  { id: 'binkw32',   package_url: 'https://github.com/lucasgertke11-bot/binkw32/releases/download/v1.0.0/binkw32.7z',   package_sha256: 'd3a0de58fa883f488f6625622562012cb1b64853bbfb064800f3326fc9998829', package_size: 106646,   registry_url: 'https://github.com/lucasgertke11-bot/binkw32/releases/download/v1.0.0/binkw32.reg',   extract_to: 'windows/' },
  { id: 'physx',     package_url: 'https://github.com/lucasgertke11-bot/physx/releases/download/v1.0.0/physx.7z',       package_sha256: '87019b93a52cba9e3db57c543102c17bab004e04b9c7ef9f4e39394df70437bc', package_size: 21729720, registry_url: 'https://github.com/lucasgertke11-bot/physx/releases/download/v1.0.0/physx.reg',     extract_to: 'windows/' },
  { id: 'webview2',  package_url: 'https://github.com/lucasgertke11-bot/webview2/releases/download/v1.0.0/webview2.7z', package_sha256: 'd9d00172558f5a348dda437835f3dd11bb1edc6fc8d81022281cee8b9785f1b9', package_size: 199573486, registry_url: 'https://github.com/lucasgertke11-bot/webview2/releases/download/v1.0.0/webview2.reg', extract_to: 'windows/' },
  { id: 'xna40',     package_url: 'https://github.com/lucasgertke11-bot/xna40/releases/download/v1.0.0/xna40.7z',       package_sha256: '4ce1c1c982f80098cd380181a556be047c687924199927e58a4e43fd1b1faa6c', package_size: 1239285,  registry_url: 'https://github.com/lucasgertke11-bot/xna40/releases/download/v1.0.0/xna40.reg',     extract_to: 'windows/' },
];

function getCachePath(depId) {
  return path.join(CACHE_DIR, depId + '.7z');
}

function getRegCachePath(depId) {
  return path.join(CACHE_DIR, depId + '.reg');
}

function getStampPath(depId, prefixPath) {
  const stampName = '.dep-' + depId + '-installed';
  return path.join(prefixPath, stampName);
}

function isDepInstalled(depId, prefixPath) {
  return fs.existsSync(getStampPath(depId, prefixPath));
}

function markDepInstalled(depId, prefixPath) {
  fs.writeFileSync(getStampPath(depId, prefixPath), new Date().toISOString());
}

function getDepInfo(depId) {
  return BUILTIN_DEPS.find(d => d.id === depId);
}

function ensureCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function downloadFile(url, dest) {
  console.error(`[deps-manager] Downloading: ${url}`);
  execFileSync('/usr/bin/curl', ['-sL', '-o', dest, url], { timeout: 300000, stdio: 'pipe' });
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
    throw new Error(`Download failed: ${url}`);
  }
}

function verifyChecksum(filePath, expectedSha) {
  const actual = execFileSync('/usr/bin/sha256sum', [filePath], { encoding: 'utf-8' }).split(' ')[0];
  if (actual !== expectedSha) {
    throw new Error(`SHA256 mismatch for ${filePath}: expected ${expectedSha}, got ${actual}`);
  }
}

function ensureDepPackage(dep) {
  ensureCache();
  const cachePath = getCachePath(dep.id);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size === dep.package_size) {
    console.error(`[deps-manager] ${dep.id} already cached`);
    return cachePath;
  }
  downloadFile(dep.package_url, cachePath);
  verifyChecksum(cachePath, dep.package_sha256);
  return cachePath;
}

function ensureRegFile(dep) {
  if (!dep.registry_url) return null;
  ensureCache();
  const cachePath = getRegCachePath(dep.id);
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }
  downloadFile(dep.registry_url, cachePath);
  return cachePath;
}

function installDepToPrefix(depId, prefixPath, protonPath) {
  const dep = getDepInfo(depId);
  if (!dep) throw new Error(`Unknown dependency: ${depId}`);
  if (isDepInstalled(depId, prefixPath)) {
    console.error(`[deps-manager] ${depId} already installed in this prefix`);
    return { installed: false, skipped: true };
  }

  console.error(`[deps-manager] Installing ${depId}...`);

  const driveC = [path.join(prefixPath, 'drive_c'), path.join(prefixPath, 'pfx', 'drive_c')]
    .find(p => fs.existsSync(p));
  if (!driveC) throw new Error('drive_c not found in prefix');

  const pkgPath = ensureDepPackage(dep);

  // Extract .7z to the prefix
  const targetDir = path.join(driveC, dep.extract_to || 'windows');
  console.error(`[deps-manager] Extracting to: ${targetDir}`);
  execFileSync('7z', ['x', '-y', '-o' + targetDir, pkgPath], { timeout: 120000, stdio: 'pipe' });

  // Apply registry if present (use Proton wine, not system wine)
  const regPath = ensureRegFile(dep);
  if (regPath) {
    console.error(`[deps-manager] Applying registry: ${regPath}`);
    const wineBin = protonPath ? path.join(protonPath, 'files', 'bin', 'wine') : '/usr/bin/wine';
    const env = { ...process.env, WINEPREFIX: prefixPath };
    execFileSync(wineBin, ['regedit', regPath], { env, stdio: 'pipe' });
  }

  markDepInstalled(depId, prefixPath);
  console.error(`[deps-manager] ${depId} installed successfully`);
  return { installed: true, skipped: false };
}

const CORE_DEPS = ['vcrun'];

function installRequiredDeps(prefixPath, protonPath) {
  const results = {};
  for (const depId of CORE_DEPS) {
    results[depId] = installDepToPrefix(depId, prefixPath, protonPath);
  }
  return results;
}

module.exports = {
  BUILTIN_DEPS,
  installDepToPrefix,
  installRequiredDeps,
  isDepInstalled,
  getDepInfo,
};
