const path = require('path');
const fs = require('fs');

const CACHE_DIR = path.join(require('os').homedir(), '.config', 'compatflow');
const CACHE_FILE = path.join(CACHE_DIR, 'ports.json');

const NATIVE = require('../data/native.json');
const GAME_NAMES = require('../data/games.json');

function getGameName(cleanName) {
  for (const [key, game] of Object.entries(GAME_NAMES)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return game;
    }
  }
  return null;
}

function loadPorts() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (data._meta) delete data._meta;
    if (data._template) delete data._template;
    return data;
  } catch {
    return {};
  }
}

function checkNative(cleanName) {
  const cleanLower = cleanName.toLowerCase();
  for (const [keyword, [app, pkg, desc]] of Object.entries(NATIVE)) {
    const kwLower = keyword.toLowerCase();
    if (cleanLower.includes(kwLower) || kwLower.includes(cleanLower)) {
      return { found: true, app, package: pkg, desc };
    }
  }
  return { found: false };
}

function checkPort(cleanName) {
  const ports = loadPorts();
  for (const [portId, port] of Object.entries(ports)) {
    const keywords = port.keywords || [];
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      const cleanLower = cleanName.toLowerCase();
      if (cleanLower.includes(kwLower) || kwLower.includes(cleanLower)) {
        return { found: true, port, id: portId };
      }
    }
  }
  return { found: false };
}

function getAppName(filepath) {
  let name = path.basename(filepath).toLowerCase();
  name = name.replace(/\.[^.]+$/, '');
  name = name.replace(/setup|installer|install/g, '');
  name = name.replace(/[-_]/g, ' ').trim();
  return name;
}

module.exports = {
  NATIVE,
  GAME_NAMES,
  getGameName,
  loadPorts,
  checkNative,
  checkPort,
  getAppName,
};
