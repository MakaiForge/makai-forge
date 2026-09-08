const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { scanDirForArchives, guessGameName } = require('./utils');
const { findOverride } = require('./overrides-loader');

function isExe(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.exe';
}

function isArchive(filePath) {
  const low = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (/\.(7z|rar|zip|tar\.gz|tgz|tar\.xz|tar)$/.test(low)) return true;
  if (/\.(7z\.\d{3}|r\d{2})$/.test(base)) return true;
  return false;
}

function isIso(filePath) {
  return path.extname(filePath).toLowerCase() === '.iso';
}

function test7zOnExe(exePath) {
  try {
    const output = execFileSync('7z', ['l', exePath], {
      timeout: 15000,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return { success: true, output };
  } catch {
    return { success: false, output: '' };
  }
}

function testInnoextract(exePath) {
  try {
    execFileSync('innoextract', ['-l', exePath], {
      timeout: 15000,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

function checkExeStrings(exePath) {
  try {
    const stat = fs.statSync(exePath);
    const maxBuffer = Math.min(Math.max(stat.size * 0.1, 1024 * 1024), 50 * 1024 * 1024);
    const buf = execFileSync('strings', [exePath], {
      timeout: 30000,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer,
    });
    return {
      hasInno: buf.includes('Inno Setup'),
      hasNsis: buf.includes('Nullsoft') || buf.includes('NSIS'),
      hasInstallShield: buf.includes('InstallShield'),
      hasWise: buf.includes('WISE'),
    };
  } catch {
    return { hasInno: false, hasNsis: false, hasInstallShield: false, hasWise: false };
  }
}

function containsNsisDirs(output) {
  return /\$PLUGINSDIR/i.test(output) || /\$TEMP/i.test(output);
}

function isPESectionListing(output) {
  const lines = output.split('\n').filter(l => /^\d{4}-\d{2}-\d{2}/.test(l));
  if (lines.length === 0) return false;
  const filePaths = lines.filter(l => {
    const parts = l.trim().split(/\s+/);
    const name = parts[parts.length - 1];
    return name.includes('/') || name.includes('\\') || /\.(exe|dll|ini|cfg|dat|pak|upk|u|gpk)$/i.test(name);
  });
  return filePaths.length === 0;
}

function classify(sourcePath, gameId, gameTitle) {
  if (sourcePath) {
    const override = findOverride(sourcePath, gameId, gameTitle);
    if (override) {
      return {
        type: override.type,
        method: override.method || override.type,
        needsWine: !!override.needsWine,
        needsRegistrySetup: !!override.needsRegistrySetup,
        confidence: override.confidence || 1.0,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        fromOverride: true,
        extractorOptions: override.extractorOptions || {},
        details: { override: override.gameId || override.matchFile },
      };
    }
  }

  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(sourcePath);
    const archives = scanDirForArchives(sourcePath);
    const exeCount = entries.filter(e => /\.exe$/i.test(e)).length;

    if (archives.length > 0 && exeCount > 0) {
      const exePath = path.join(sourcePath, entries.find(e => /\.exe$/i.test(e)));
      return {
        type: 'exe-with-companions',
        method: 'native-7z-and-wine',
        needsWine: true,
        needsRegistrySetup: true,
        confidence: 0.9,
        gameName: guessGameName(exePath),
        companionArchives: archives,
        originalPath: exePath,
        details: { isDirectory: true, archiveCount: archives.length, exeCount },
      };
    }

    if (archives.length > 0) {
      return {
        type: 'pure-archive',
        method: 'native-archive',
        needsWine: false,
        needsRegistrySetup: false,
        confidence: 0.85,
        gameName: guessGameName(sourcePath),
        companionArchives: archives,
        originalPath: sourcePath,
        details: { isDirectory: true, archiveCount: archives.length, exeCount },
      };
    }

    if (exeCount > 0) {
      return {
        type: 'portable',
        method: 'copy',
        needsWine: false,
        needsRegistrySetup: false,
        confidence: 0.9,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        details: { isDirectory: true, exeCount },
      };
    }

    return {
      type: 'unknown',
      method: 'wine-fallback',
      needsWine: true,
      needsRegistrySetup: true,
      confidence: 0.3,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { isDirectory: true, reason: 'empty or unknown folder' },
    };
  }

  if (isArchive(sourcePath)) {
    const archives = [sourcePath];
    const dir = path.dirname(sourcePath);
    const siblings = scanDirForArchives(dir);
    for (const s of siblings) {
      if (s !== sourcePath && !archives.includes(s)) archives.push(s);
    }
    const exeFiles = fs.readdirSync(dir).filter(e => /\.exe$/i.test(e));
    return {
      type: 'pure-archive',
      method: 'native-archive',
      needsWine: false,
      needsRegistrySetup: exeFiles.length > 0,
      confidence: 0.95,
      gameName: guessGameName(sourcePath),
      companionArchives: archives,
      originalPath: sourcePath,
      details: { isArchive: true, siblingExes: exeFiles.length },
    };
  }

  if (isIso(sourcePath)) {
    return {
      type: 'iso',
      method: 'native-7z',
      needsWine: false,
      needsRegistrySetup: false,
      confidence: 0.95,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { isIso: true },
    };
  }

  if (!isExe(sourcePath)) {
    return {
      type: 'unknown',
      method: 'wine-fallback',
      needsWine: true,
      needsRegistrySetup: true,
      confidence: 0.1,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { reason: 'unrecognized file type' },
    };
  }

  if (!fs.existsSync(sourcePath)) {
    return {
      type: 'unknown',
      method: 'wine-fallback',
      needsWine: true,
      needsRegistrySetup: true,
      confidence: 0,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { reason: 'file not found' },
    };
  }

  const exeSize = stat.size;

  const strings = checkExeStrings(sourcePath);

  if (exeSize > 100 * 1024 * 1024) {
    const sevenResult = test7zOnExe(sourcePath);
    if (sevenResult.success) {
      if (containsNsisDirs(sevenResult.output)) {
        return {
          type: 'nsis',
          method: 'native-7z',
          needsWine: false,
          needsRegistrySetup: false,
          confidence: 0.9,
          gameName: guessGameName(sourcePath),
          companionArchives: [],
          originalPath: sourcePath,
          details: { exeSize, sevenResult: 'nsis', ...strings },
        };
      }
      if (isPESectionListing(sevenResult.output)) {
        return fallbackToGeneric(exeSize, sourcePath, strings);
      }
      return {
        type: 'sfx',
        method: 'native-7z',
        needsWine: false,
        needsRegistrySetup: false,
        confidence: 0.85,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        details: { exeSize, sevenResult: 'sfx', ...strings },
      };
    }
    const innoOk = testInnoextract(sourcePath);
    if (innoOk) {
      return {
        type: 'inno-std',
        method: 'innoextract',
        needsWine: false,
        needsRegistrySetup: false,
        confidence: 0.9,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        details: { exeSize, innoextractResult: 'ok', ...strings },
      };
    }
    if (strings.hasInno) {
      return {
        type: 'inno-custom',
        method: 'wine-fallback',
        needsWine: true,
        needsRegistrySetup: true,
        confidence: 0.7,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        details: { exeSize, innoextractResult: 'failed', ...strings },
      };
    }
    if (strings.hasNsis) {
      return {
        type: 'nsis',
        method: 'native-7z',
        needsWine: false,
        needsRegistrySetup: false,
        confidence: 0.6,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        details: { exeSize, reason: 'nsis strings detected', ...strings },
      };
    }
    return {
      type: 'unknown',
      method: 'wine-fallback',
      needsWine: true,
      needsRegistrySetup: true,
      confidence: 0.4,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { exeSize, reason: 'large unknown exe', ...strings },
    };
  }

  const sevenResult = test7zOnExe(sourcePath);
  if (sevenResult.success) {
    if (containsNsisDirs(sevenResult.output)) {
      return {
        type: 'nsis',
        method: 'native-7z',
        needsWine: false,
        needsRegistrySetup: false,
        confidence: 0.95,
        gameName: guessGameName(sourcePath),
        companionArchives: [],
        originalPath: sourcePath,
        details: { exeSize, sevenResult: 'nsis', ...strings },
      };
    }
    if (isPESectionListing(sevenResult.output)) {
      return fallbackToGeneric(exeSize, sourcePath, strings);
    }
    return {
      type: 'sfx',
      method: 'native-7z',
      needsWine: false,
      needsRegistrySetup: false,
      confidence: 0.9,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { exeSize, sevenResult: 'sfx', ...strings },
    };
  }

  const innoOk = testInnoextract(sourcePath);
  if (innoOk) {
    return {
      type: 'inno-std',
      method: 'innoextract',
      needsWine: false,
      needsRegistrySetup: false,
      confidence: 0.95,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { exeSize, innoextractResult: 'ok', ...strings },
    };
  }

  return fallbackToGeneric(exeSize, sourcePath, strings);
}

function fallbackToGeneric(exeSize, sourcePath, strings) {
  const exeDir = path.dirname(sourcePath);
  const companions = scanDirForArchives(exeDir);

  if (companions.length > 0) {
    return {
      type: 'exe-with-companions',
      method: 'native-7z-and-wine',
      needsWine: true,
      needsRegistrySetup: true,
      confidence: 0.95,
      gameName: guessGameName(sourcePath),
      companionArchives: companions,
      originalPath: sourcePath,
      details: { exeSize, companionCount: companions.length, innoextractResult: 'failed', ...strings },
    };
  }

  if (strings.hasInno) {
    return {
      type: 'inno-custom',
      method: 'wine-fallback',
      needsWine: true,
      needsRegistrySetup: true,
      confidence: 0.75,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { exeSize, innoextractResult: 'failed', ...strings },
    };
  }

  return {
    type: 'unknown',
    method: 'wine-fallback',
    needsWine: true,
    needsRegistrySetup: true,
    confidence: 0.3,
    gameName: guessGameName(sourcePath),
    companionArchives: [],
    originalPath: sourcePath,
    details: { exeSize, reason: 'no matching classification', ...strings },
  };
}

module.exports = { classify };
