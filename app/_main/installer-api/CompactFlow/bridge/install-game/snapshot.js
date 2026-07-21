const path = require('path');
const fs = require('fs');
const os = require('os');

const KNOWN_SYSTEM_EXE = /^(uninstall|vc_redist|dotnet|dxwebsetup|oalinst|vcredist|wordpad|wmplayer|notepad|explorer|write|calc|snippingtool|regedit|cmd|taskmgr|msinfo|mmc|powershell|winword|excel|iexplore|7z|hpatchz|crashreport)/i;
const KNOWN_SYSTEM_DIRS = [
  'windows', 'windows/system32', 'windows/syswow64', 'windows/fonts',
  'windows/installer', 'windows/Microsoft.NET', 'windows/winsxs',
  'users', 'ProgramData',
];

function takeSnapshot(prefixPath) {
  const snapshot = {};
  const driveC = [path.join(prefixPath, 'drive_c'), path.join(prefixPath, 'pfx', 'drive_c')]
    .find(p => fs.existsSync(p));
  if (!driveC) return snapshot;

  function walk(dir, depth = 0) {
    if (depth > 8) return;
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          const rel = path.relative(driveC, full);
          const seg = rel.split(path.sep);
          if (seg.some(s => KNOWN_SYSTEM_DIRS.includes(s))) continue;

          snapshot[rel] = {
            path: full,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            isDirectory: stat.isDirectory(),
          };

          if (stat.isDirectory()) walk(full, depth + 1);
        } catch {}
      }
    } catch {}
  }

  walk(driveC);
  return snapshot;
}

function scanPrefixForExes(prefixPath) {
  const driveCPaths = [
    path.join(prefixPath, 'drive_c'),
    path.join(prefixPath, 'pfx', 'drive_c'),
  ].filter(p => fs.existsSync(p));
  if (driveCPaths.length === 0) return { candidates: [], suggestedDirs: [] };

  const exes = [];
  const dirMtimes = {};
  const seenPaths = new Set();

  function walk(dir, driveC, depth = 0) {
    if (depth > 8) return;
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          if (seenPaths.has(full)) continue;
          seenPaths.add(full);

          const stat = fs.statSync(full);
          const rel = path.relative(driveC, full);
          const seg = rel.split(path.sep);
          if (seg.some(s => KNOWN_SYSTEM_DIRS.includes(s))) continue;

          if (stat.isDirectory()) {
            dirMtimes[rel] = stat.mtimeMs;
            walk(full, driveC, depth + 1);
            continue;
          }

          if (!entry.toLowerCase().endsWith('.exe')) continue;
          if (stat.size < 4096) continue;
          if (KNOWN_SYSTEM_EXE.test(entry)) continue;

          exes.push({
            path: full,
            name: entry,
            relative: rel,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          });
        } catch {}
      }
    } catch {}
  }

  for (const dc of driveCPaths) {
    console.error(`[install-game] Scanning: ${dc}`);
    walk(dc, dc, 0);
  }

  exes.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const recentDirs = Object.entries(dirMtimes)
    .filter(([k]) => k.includes('/'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { candidates: exes.slice(0, 8), suggestedDirs: recentDirs };
}

function isInstallerExe(filePath) {
  return classifyExe(filePath) === 'installer';
}

function classifyExe(exePath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-classify-'));
  try {
    const { execFileSync } = require('child_process');
    execFileSync('7z', ['x', '-y', '-o' + tmpDir, exePath], { timeout: 30000, stdio: 'pipe' });
  } catch {
    // Extração falhou → não é archive → executável portátil
    return 'portable';
  }

  // Análise da estrutura extraída
  const entries = fs.readdirSync(tmpDir);
  const hasPluginDir = entries.some(e => /^\$?(?:PLUGINSDIR|\d+)$/i.test(e) && isDirSafe(path.join(tmpDir, e)));
  const hasInstallScript = entries.some(e => e.toLowerCase() === 'install_script.dat');
  const hasUninstallExe = findFile(tmpDir, f => f.toLowerCase() === 'uninstall.exe');
  const hasVcRedist = findFile(tmpDir, f => /vc_redist/i.test(f));

  if (hasPluginDir || hasInstallScript || hasUninstallExe || hasVcRedist) {
    return 'installer';
  }

  const totalFiles = countFiles(tmpDir);
  if (totalFiles > 2) {
    return 'installer';
  }

  // Extração mínima: verifica por outros métodos
  try {
    const { execFileSync } = require('child_process');
    const fileOut = execFileSync('/usr/bin/file', ['-b', exePath], { timeout: 3000, encoding: 'utf-8' });
    if (/Nullsoft|Inno Setup|InstallShield|self-extracting|installer|setup/i.test(fileOut)) {
      return 'installer';
    }
  } catch {}

  // Fallback final: nome do arquivo
  const name = path.basename(exePath).toLowerCase();
  if (/setup|install|msi/.test(name) || exePath.endsWith('.msi')) {
    return 'installer';
  }

  return 'portable';
}

function isDirSafe(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function countFiles(dir) {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      try {
        if (fs.statSync(p).isDirectory()) n += countFiles(p);
        else n++;
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
        if (fs.statSync(p).isDirectory()) {
          const found = findFile(p, predicate);
          if (found) return found;
        } else if (predicate(e)) {
          return p;
        }
      } catch {}
    }
  } catch {}
  return null;
}

module.exports = { takeSnapshot, scanPrefixForExes, isInstallerExe, classifyExe };
